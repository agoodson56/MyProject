/**
 * Specification Parser Service
 * Extracts device schedules, material requirements, and system specifications
 * from Division 27 (Communications) and Division 28 (Electronic Safety) specs
 */

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
const GEMINI_UPLOAD_URL = 'https://generativelanguage.googleapis.com/upload/v1beta/files';

/**
 * Upload a PDF to Gemini File API
 */
async function uploadToGemini(file) {
    console.log(`[SPEC] Uploading specification: ${file.name}`);

    const startResponse = await fetch(
        `${GEMINI_UPLOAD_URL}?key=${GEMINI_API_KEY}`,
        {
            method: 'POST',
            headers: {
                'X-Goog-Upload-Protocol': 'resumable',
                'X-Goog-Upload-Command': 'start',
                'X-Goog-Upload-Header-Content-Length': file.size.toString(),
                'X-Goog-Upload-Header-Content-Type': file.type || 'application/pdf',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                file: { displayName: file.name }
            })
        }
    );

    if (!startResponse.ok) {
        throw new Error(`Upload start failed: ${startResponse.status}`);
    }

    const uploadUrl = startResponse.headers.get('X-Goog-Upload-URL');
    const fileBuffer = await file.arrayBuffer();

    const uploadResponse = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
            'X-Goog-Upload-Offset': '0',
            'X-Goog-Upload-Command': 'upload, finalize',
            'Content-Length': file.size.toString()
        },
        body: fileBuffer
    });

    if (!uploadResponse.ok) {
        throw new Error(`Upload data failed: ${uploadResponse.status}`);
    }

    const result = await uploadResponse.json();
    let uploadedFile = result.file;
    let attempts = 0;

    while (uploadedFile.state === 'PROCESSING' && attempts < 60) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        const fileName = uploadedFile.name.replace('files/', '');
        const statusResponse = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/files/${fileName}?key=${GEMINI_API_KEY}`
        );
        if (statusResponse.ok) {
            uploadedFile = await statusResponse.json();
        }
        attempts++;
    }

    if (uploadedFile.state !== 'ACTIVE') {
        throw new Error(`File processing failed. State: ${uploadedFile.state}`);
    }

    return uploadedFile;
}

/**
 * Parse a specification document for device schedules and requirements
 */
export async function parseSpecification(file) {
    if (!GEMINI_API_KEY || GEMINI_API_KEY === 'your-gemini-api-key-here') {
        throw new Error('Please set your Gemini API key in the .env file');
    }

    console.log(`[SPEC] Parsing specification: ${file.name}`);
    const startTime = Date.now();

    // Upload PDF
    const uploadedFile = await uploadToGemini(file);

    const prompt = `You are an expert low-voltage construction estimator analyzing project specifications.

ANALYZE THIS SPECIFICATION DOCUMENT and extract all device counts, material requirements, and system specifications.

FOCUS ON THESE DIVISIONS:
- Division 27: COMMUNICATIONS (Structured Cabling, Data, Voice, Fiber, Wireless)
- Division 28: ELECTRONIC SAFETY AND SECURITY (Fire Alarm, Access Control, CCTV, Intrusion)

EXTRACT THE FOLLOWING:

1. DEVICE SCHEDULES - Look for schedules/tables listing device quantities
2. APPROVED MANUFACTURERS - List required/approved manufacturers per system
3. CABLE REQUIREMENTS - Cable types, ratings (Plenum/Riser), categories
4. EQUIPMENT REQUIREMENTS - Panels, racks, switches, NVRs, etc.
5. PATHWAY REQUIREMENTS - Conduit, J-hooks, cable tray specifications
6. TESTING REQUIREMENTS - Certification requirements (TIA, UL, etc.)

OUTPUT FORMAT (JSON):
{
    "specificationTitle": "Project Name - Communications & Security Specifications",
    "divisions": [
        {
            "number": "27 10 00",
            "title": "STRUCTURED CABLING - GENERAL REQUIREMENTS",
            "requirements": ["All cables shall be Plenum-rated", "CAT6A minimum for all data"]
        }
    ],
    "deviceSchedules": [
        {
            "system": "CABLING",
            "type": "Data Outlet",
            "specifiedQty": 248,
            "section": "27 15 00",
            "notes": "CAT6A, blue jack"
        },
        {
            "system": "FIRE",
            "type": "Smoke Detector",
            "specifiedQty": 86,
            "section": "28 31 00",
            "notes": "Addressable photoelectric"
        }
    ],
    "approvedManufacturers": {
        "CABLING": {
            "Cable": ["Belden", "Berk-Tek", "CommScope"],
            "Jacks/Panels": ["Panduit", "Leviton", "CommScope"],
            "Racks": ["Chatsworth", "Great Lakes", "Middle Atlantic"]
        },
        "FIRE": {
            "Detectors": ["Notifier", "EST", "Simplex"],
            "FACP": ["Notifier", "EST", "Simplex"]
        },
        "ACCESS": {
            "Readers": ["HID", "AMAG"],
            "Panels": ["Mercury", "HID"]
        },
        "CCTV": {
            "Cameras": ["Axis", "Hanwha", "Bosch"],
            "NVR": ["Milestone", "Genetec"]
        }
    },
    "cableRequirements": [
        {
            "type": "CAT6A",
            "rating": "Plenum",
            "jacket": "Blue",
            "system": "CABLING",
            "usage": "Data outlets"
        },
        {
            "type": "18/2 FPLP",
            "rating": "Plenum",
            "jacket": "Red",
            "system": "FIRE",
            "usage": "SLC circuits"
        }
    ],
    "equipmentRequirements": [
        {
            "type": "Access Control Panel",
            "model": "Mercury MR52",
            "qty": 8,
            "section": "28 13 00"
        }
    ],
    "testingRequirements": [
        "All CAT6A cables shall be certified to TIA-568.2-D specifications",
        "Fiber cables shall be tested with OTDR and pass/fail results documented"
    ],
    "notes": "Specification analysis complete. Found device schedules for 4 systems.",
    "confidence": 0.92
}

Extract ALL device quantities, manufacturers, and requirements you can find!`;

    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{
                parts: [
                    { text: prompt },
                    {
                        fileData: {
                            mimeType: uploadedFile.mimeType,
                            fileUri: uploadedFile.uri
                        }
                    }
                ]
            }],
            generationConfig: {
                temperature: 0.1,
                maxOutputTokens: 16384
            }
        })
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!textResponse) {
        throw new Error('No response from Gemini API');
    }

    // Parse JSON from response
    const jsonMatch = textResponse.match(/```json\s*([\s\S]*?)\s*```/) ||
        textResponse.match(/```\s*([\s\S]*?)\s*```/) ||
        [null, textResponse];

    const result = JSON.parse((jsonMatch[1] || textResponse).trim());

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[SPEC] Specification parsed in ${elapsed}s - ${result.deviceSchedules?.length || 0} device types found`);

    return result;
}

/**
 * Compare specification quantities against floor plan counts
 */
export function crossReferenceSpecVsPlan(specResult, planCounts) {
    const discrepancies = [];
    const matches = [];

    if (!specResult?.deviceSchedules || !planCounts) {
        return { discrepancies: [], matches: [], analysisComplete: false };
    }

    for (const schedule of specResult.deviceSchedules) {
        const system = schedule.system;
        const type = schedule.type;
        const specQty = schedule.specifiedQty || 0;

        // Find matching device in plan counts
        let planQty = 0;
        if (planCounts[system]) {
            // Try exact match
            if (planCounts[system][type]) {
                planQty = planCounts[system][type].qty || planCounts[system][type];
            } else {
                // Try partial match
                for (const [key, value] of Object.entries(planCounts[system])) {
                    if (key.toLowerCase().includes(type.toLowerCase()) ||
                        type.toLowerCase().includes(key.toLowerCase())) {
                        planQty = value.qty || value;
                        break;
                    }
                }
            }
        }

        if (planQty > 0 || specQty > 0) {
            const diff = planQty - specQty;
            const pctDiff = specQty > 0 ? Math.abs(diff / specQty * 100) : 100;

            if (diff === 0) {
                matches.push({
                    system,
                    type,
                    qty: specQty,
                    status: 'MATCH'
                });
            } else {
                discrepancies.push({
                    system,
                    type,
                    specQty,
                    planQty,
                    difference: diff,
                    percentDiff: pctDiff.toFixed(1),
                    severity: pctDiff > 20 ? 'HIGH' : pctDiff > 10 ? 'MEDIUM' : 'LOW',
                    section: schedule.section,
                    recommendation: diff > 0
                        ? `Floor plans show ${diff} more than spec. Verify with engineer.`
                        : `Spec shows ${Math.abs(diff)} more than plans. Check for missing symbols.`
                });
            }
        }
    }

    return {
        discrepancies,
        matches,
        totalChecked: specResult.deviceSchedules.length,
        matchRate: matches.length / (matches.length + discrepancies.length) * 100,
        analysisComplete: true
    };
}

/**
 * Extract approved manufacturers for each system
 */
export function getApprovedManufacturers(specResult, system) {
    if (!specResult?.approvedManufacturers || !specResult.approvedManufacturers[system]) {
        return null;
    }
    return specResult.approvedManufacturers[system];
}

/**
 * Get cable requirements for a specific system
 */
export function getCableRequirements(specResult, system) {
    if (!specResult?.cableRequirements) {
        return [];
    }
    return specResult.cableRequirements.filter(c => c.system === system);
}
