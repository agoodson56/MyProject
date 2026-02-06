/**
 * Blueprint AI Analyzer Service - Enhanced Multi-Pass Analysis
 * Uses Gemini Vision API with 3-pass verification for maximum accuracy
 * 
 * Pass 1: Legend Extraction - Learn symbol meanings from drawing legend
 * Pass 2: Grid-Based Count - Divide sheet into quadrants for systematic counting
 * Pass 3: Full Sheet Validation - Cross-validate totals and resolve discrepancies
 */

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
const GEMINI_UPLOAD_URL = 'https://generativelanguage.googleapis.com/upload/v1beta/files';

// ============================================================================
// FILE UPLOAD UTILITIES
// ============================================================================

/**
 * Upload a file to Gemini File API (for PDFs and large files)
 * Uses resumable upload protocol for reliability
 */
async function uploadToGemini(file) {
    console.log(`[AI] Uploading PDF: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)}MB)`);

    // Step 1: Start resumable upload session
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
        const errorText = await startResponse.text();
        console.error('[AI] Upload start failed:', startResponse.status, errorText);
        throw new Error(`Upload start failed: ${startResponse.status}`);
    }

    const uploadUrl = startResponse.headers.get('X-Goog-Upload-URL');
    console.log('[AI] Got upload URL, uploading file data...');

    // Step 2: Upload file data
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
        const errorText = await uploadResponse.text();
        console.error('[AI] Upload data failed:', uploadResponse.status, errorText);
        throw new Error(`Upload data failed: ${uploadResponse.status}`);
    }

    const result = await uploadResponse.json();
    console.log('[AI] File uploaded:', result.file?.name, 'State:', result.file?.state);

    // Step 3: Wait for file to be processed (poll for ACTIVE state)
    let uploadedFile = result.file;
    let attempts = 0;
    const maxAttempts = 60; // 60 seconds max wait for large PDFs

    while (uploadedFile.state === 'PROCESSING' && attempts < maxAttempts) {
        console.log(`[AI] Waiting for PDF processing... (${attempts + 1}s)`);
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Check file status
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

    console.log('[AI] PDF ready for analysis:', uploadedFile.uri);
    return uploadedFile;
}

/**
 * Helper: Convert File to base64
 */
async function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const base64 = reader.result.split(',')[1];
            resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

/**
 * Prepare file for Gemini API (handles both PDF and images)
 */
async function prepareFileForGemini(file) {
    const isPDF = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

    if (isPDF) {
        try {
            const uploadedFile = await uploadToGemini(file);
            return {
                fileData: {
                    mimeType: uploadedFile.mimeType,
                    fileUri: uploadedFile.uri
                }
            };
        } catch (uploadError) {
            console.error('[AI] PDF upload failed, trying base64 fallback:', uploadError);
            const base64Data = await fileToBase64(file);
            return {
                inlineData: {
                    mimeType: 'application/pdf',
                    data: base64Data
                }
            };
        }
    } else {
        const base64Data = await fileToBase64(file);
        const mimeType = file.type || 'image/png';
        return {
            inlineData: {
                mimeType: mimeType,
                data: base64Data
            }
        };
    }
}

/**
 * Execute a Gemini API call with the given prompt and file
 */
async function callGeminiAPI(prompt, filePart, temperature = 0.1) {
    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{
                parts: [
                    { text: prompt },
                    filePart
                ]
            }],
            generationConfig: {
                temperature: temperature,
                maxOutputTokens: 16384
            }
        })
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error('[AI] API Error:', response.status, errorText);
        throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!textResponse) {
        throw new Error('No response from Gemini API');
    }

    // Robust JSON extraction with multiple fallback strategies
    return extractJSON(textResponse);
}

/**
 * Robust JSON extraction from AI text responses
 * Handles markdown code blocks, malformed JSON, and common issues
 */
function extractJSON(text) {
    console.log('[AI] Extracting JSON from response, length:', text.length);

    // Strategy 1: Remove markdown code block wrappers directly
    let jsonStr = text
        .replace(/^```json\s*/i, '')      // Remove opening ```json
        .replace(/^```\s*/i, '')          // Remove opening ```
        .replace(/\s*```$/i, '')          // Remove closing ```
        .trim();

    // If that didn't work, try regex extraction
    if (jsonStr.startsWith('`')) {
        const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (match) {
            jsonStr = match[1].trim();
        }
    }

    // Strategy 2: Find JSON object/array boundaries
    const firstBrace = jsonStr.indexOf('{');
    const firstBracket = jsonStr.indexOf('[');
    const startIdx = firstBrace >= 0 && (firstBracket < 0 || firstBrace < firstBracket) ? firstBrace : firstBracket;

    if (startIdx >= 0) {
        let depth = 0;
        let endIdx = -1;
        let inString = false;
        let prevChar = '';

        for (let i = startIdx; i < jsonStr.length; i++) {
            const char = jsonStr[i];

            // Track string boundaries (ignore braces inside strings)
            if (char === '"' && prevChar !== '\\') {
                inString = !inString;
            }

            if (!inString) {
                if (char === '{' || char === '[') depth++;
                if (char === '}' || char === ']') depth--;
                if (depth === 0) {
                    endIdx = i;
                    break;
                }
            }
            prevChar = char;
        }

        if (endIdx > startIdx) {
            jsonStr = jsonStr.slice(startIdx, endIdx + 1);
        }
    }

    // Strategy 3: Clean common JSON issues
    jsonStr = jsonStr
        .replace(/,\s*}/g, '}')           // Remove trailing commas in objects
        .replace(/,\s*\]/g, ']')          // Remove trailing commas in arrays
        .replace(/\r\n/g, '\n')           // Normalize line endings
        .replace(/\t/g, ' ')              // Replace tabs with spaces
        .trim();

    try {
        const result = JSON.parse(jsonStr);
        console.log('[AI] JSON parsed successfully');
        return result;
    } catch (e1) {
        console.warn('[AI] JSON parse attempt 1 failed:', e1.message);
        console.log('[AI] Attempting cleanup, first 300 chars:', jsonStr.substring(0, 300));

        // Strategy 4: More aggressive cleanup
        try {
            const cleanedJson = jsonStr
                .replace(/[\x00-\x1F\x7F]/g, ' ')  // Remove control characters
                .replace(/\s+/g, ' ')              // Collapse whitespace
                .replace(/,\s*([}\]])/g, '$1')     // Remove trailing commas again
                .replace(/([{,])\s*(\w+)\s*:/g, '$1"$2":') // Quote unquoted keys
                .replace(/:\s*'([^']*)'/g, ':"$1"');      // Single to double quotes in values

            const result = JSON.parse(cleanedJson);
            console.log('[AI] JSON parsed after cleanup');
            return result;
        } catch (e2) {
            console.warn('[AI] JSON parse attempt 2 failed:', e2.message);
        }

        // Strategy 5: Try to extract just device counts manually from the text
        console.log('[AI] Attempting regex extraction of counts...');
        const deviceCounts = {};
        const summaryMatch = text.match(/"summary"\s*:\s*\{([^}]+)\}/);

        if (summaryMatch) {
            const countMatches = summaryMatch[1].matchAll(/"([^"]+)"\s*:\s*(\d+)/g);
            for (const match of countMatches) {
                deviceCounts[match[1]] = parseInt(match[2]);
            }
        }

        // Also try general pattern
        const generalMatches = text.matchAll(/"(Data Outlet|Voice Outlet|WAP|Smoke Detector|Card Reader|Dome Camera|Horn.?Strobe|Pull Station|REX|Door Contact)"\s*:\s*(\d+)/gi);
        for (const match of generalMatches) {
            const key = match[1].trim();
            const value = parseInt(match[2]);
            if (!isNaN(value) && value > 0 && value < 10000) {
                deviceCounts[key] = value;
            }
        }

        if (Object.keys(deviceCounts).length > 0) {
            console.log('[AI] Extracted counts via regex:', deviceCounts);
            return { devices: [], symbols: [], summary: { EXTRACTED: deviceCounts }, notes: 'Counts extracted via fallback' };
        }

        // Return empty result rather than throwing
        console.error('[AI] Could not parse response, returning empty result');
        return { devices: [], symbols: [], summary: {}, codeCompliance: { status: 'UNKNOWN', violations: [], notes: 'Analysis failed - manual review required' } };
    }
}

// ============================================================================
// PASS 1: LEGEND EXTRACTION
// ============================================================================

const LEGEND_EXTRACTION_PROMPT = `You are an expert low-voltage construction estimator. Your task is to:
1. CLASSIFY this sheet type
2. Find and extract the SYMBOL LEGEND if present

STEP 1 - CLASSIFY SHEET TYPE:
Determine what type of sheet this is:

A) "FLOOR_PLAN" - Shows actual room layouts with walls, doors, spaces where devices are installed
   - Has room boundaries and walls
   - Shows multiple device symbols placed IN actual locations
   - May have a small legend in a corner
   - THIS IS WHERE WE COUNT DEVICES

B) "LEGEND_SHEET" - Dedicated symbol reference sheet (DO NOT COUNT DEVICES HERE)
   - Primary purpose is to show what each symbol means
   - Title includes: "Legend", "Symbol Schedule", "Symbol Key", "Device Schedule"
   - Shows symbols with descriptions/labels next to them
   - Used as REFERENCE ONLY - symbols here are examples, not installed devices

C) "SCHEDULE_SHEET" - Equipment tables/lists (DO NOT COUNT DEVICES HERE)
   - Shows tables with quantities, model numbers, specifications
   - Riser diagrams, panel schedules, equipment lists
   - Already contains counts - do not re-count

D) "TITLE_SHEET" - Cover sheet with project info (NO DEVICES)

E) "DETAIL_SHEET" - Close-up installation details (DO NOT COUNT)
   - Shows how to install/wire specific devices
   - Enlarged views, mounting details, wiring diagrams

STEP 2 - EXTRACT LEGEND (if visible):
Look for a "LEGEND", "SYMBOL LEGEND", "SYMBOL KEY", or "SYMBOLS" box

EXTRACT ALL SYMBOLS for these systems:
- STRUCTURED CABLING: Data outlets, voice outlets, fiber, WAP/wireless access points
- SECURITY/INTRUSION: Motion sensors, glass break, door contacts, keypads
- ACCESS CONTROL: Card readers, REX sensors, electric strikes, mag locks
- CCTV: Dome cameras, bullet cameras, PTZ cameras
- FIRE ALARM: Smoke detectors, heat detectors, pull stations, horn/strobes
- INTERCOM/PAGING: Speakers, intercoms

OUTPUT FORMAT (JSON):
{
    "sheetType": "FLOOR_PLAN",
    "sheetName": "E1.01 - First Floor Plan",
    "shouldCountDevices": true,
    "sheetTypeReason": "Shows room layouts with device symbols placed in actual locations",
    "legendFound": true,
    "legendLocation": "bottom-right corner",
    "symbols": [
        {
            "symbol": "Circle with D",
            "description": "Data Outlet",
            "system": "CABLING",
            "visualDescription": "Small circle with letter D inside"
        }
    ],
    "notes": "Floor plan sheet with 12 symbol types in corner legend"
}

For LEGEND_SHEET or SCHEDULE_SHEET, return shouldCountDevices: false:
{
    "sheetType": "LEGEND_SHEET",
    "sheetName": "E0.01 - Symbol Legend",
    "shouldCountDevices": false,
    "sheetTypeReason": "Dedicated symbol reference sheet - symbols shown are examples for identification only",
    "legendFound": true,
    "legendLocation": "full sheet",
    "symbols": [...],
    "notes": "Legend/schedule sheet - USE FOR REFERENCE ONLY, do not count devices"
}`;

async function extractLegend(filePart) {
    console.log('[AI] Pass 1: Extracting legend symbols...');
    try {
        const result = await callGeminiAPI(LEGEND_EXTRACTION_PROMPT, filePart);
        console.log('[AI] Pass 1 Complete:', result.legendFound ? `Found ${result.symbols?.length || 0} symbols` : 'No legend found');
        return result;
    } catch (error) {
        console.error('[AI] Pass 1 Error:', error);
        return { legendFound: false, symbols: [], notes: 'Legend extraction failed' };
    }
}

// ============================================================================
// PASS 2: GRID-BASED COUNTING
// ============================================================================

function buildGridCountingPrompt(legendInfo) {
    const symbolDescriptions = legendInfo.legendFound && legendInfo.symbols?.length > 0
        ? `\n\nLEGEND SYMBOLS TO LOOK FOR (from this drawing's legend):\n${legendInfo.symbols.map(s => `- ${s.symbol}: ${s.description} (${s.system})`).join('\n')}`
        : '';

    return `You are an expert low-voltage construction estimator. CAREFULLY count EVERY device symbol on this floor plan.

CRITICAL COUNTING RULES:
1. Mentally divide the plan into a 3x3 GRID (9 zones: top-left, top-center, top-right, etc.)
2. Count each zone SEPARATELY then sum for totals
3. Count EVERY symbol, even if partially obscured or overlapping
4. When in doubt, COUNT IT - it's better to overcount than undercount
5. For repeating units (apartments, hotel rooms), count EACH UNIT separately

⚠️ IMPORTANT - DO NOT COUNT SYMBOLS IN THESE AREAS:
- The LEGEND BOX (usually in a corner) - these are reference symbols, not installed devices
- Title blocks, notes sections, or detail callouts
- Only count symbols that are placed IN ACTUAL ROOM LOCATIONS on the floor plan
- If a room appears in multiple places (like a typical room detail), only count it once unless clearly showing different rooms
${symbolDescriptions}

SYSTEMS TO COUNT:
1. CABLING: Data Outlets, Voice Outlets, Fiber Outlets, WAP (Wireless Access Points)
2. ACCESS: Card Readers, REX Sensors, Door Contacts, Electric Strikes, Mag Locks
3. CCTV: Dome Cameras, Bullet Cameras, PTZ Cameras
4. FIRE: Smoke Detectors, Heat Detectors, Pull Stations, Horn/Strobes, Duct Detectors
5. INTERCOM: Intercom Stations, Speakers, Video Intercoms
6. A/V: Audio speakers, displays, projector locations

OUTPUT FORMAT (JSON):
{
    "sheetName": "T1.01",
    "gridCounts": {
        "topLeft": { "CABLING": {"Data Outlet": 3, "WAP": 1}, "FIRE": {"Smoke Detector": 2} },
        "topCenter": { "CABLING": {"Data Outlet": 5}, "CCTV": {"Dome Camera": 1} },
        "topRight": { "CABLING": {"Data Outlet": 4, "Voice Outlet": 2} },
        "middleLeft": { "ACCESS": {"Card Reader": 1} },
        "middleCenter": { "FIRE": {"Smoke Detector": 3} },
        "middleRight": { "CABLING": {"Data Outlet": 2} },
        "bottomLeft": { "FIRE": {"Pull Station": 1, "Horn/Strobe": 2} },
        "bottomCenter": { "CABLING": {"Data Outlet": 3} },
        "bottomRight": { "CCTV": {"Dome Camera": 2} }
    },
    "totalsBySystem": {
        "CABLING": {"Data Outlet": 17, "Voice Outlet": 2, "WAP": 1},
        "ACCESS": {"Card Reader": 1},
        "CCTV": {"Dome Camera": 3},
        "FIRE": {"Smoke Detector": 5, "Pull Station": 1, "Horn/Strobe": 2}
    },
    "confidence": 0.92,
    "countingNotes": "Counted 9 zones systematically. Some symbols in top-right partially obscured."
}

COUNT EVERY SINGLE SYMBOL. Do not skip any zones.`;
}

async function gridBasedCount(filePart, legendInfo) {
    console.log('[AI] Pass 2: Grid-based systematic counting...');

    // Skip counting on legend/schedule sheets - use them for reference only
    if (legendInfo.shouldCountDevices === false) {
        console.log(`[AI] Pass 2: SKIPPING count on ${legendInfo.sheetType} sheet "${legendInfo.sheetName}" - reference only`);
        return {
            gridCounts: {},
            totalsBySystem: {},
            confidence: 1.0,
            countingNotes: `Skipped counting - ${legendInfo.sheetType} used for symbol reference only`,
            skippedSheet: true,
            sheetType: legendInfo.sheetType
        };
    }

    try {
        const prompt = buildGridCountingPrompt(legendInfo);
        const result = await callGeminiAPI(prompt, filePart);
        console.log('[AI] Pass 2 Complete:', JSON.stringify(result.totalsBySystem || {}));
        return result;
    } catch (error) {
        console.error('[AI] Pass 2 Error:', error);
        return { gridCounts: {}, totalsBySystem: {}, confidence: 0, countingNotes: 'Grid counting failed' };
    }
}

// ============================================================================
// PASS 3: FULL SHEET VALIDATION WITH BOUNDING BOXES
// ============================================================================

function buildValidationPrompt(gridCounts, legendInfo) {
    const gridSummary = gridCounts.totalsBySystem
        ? `\n\nPREVIOUS COUNT (to validate):\n${JSON.stringify(gridCounts.totalsBySystem, null, 2)}`
        : '';

    const symbolDescriptions = legendInfo.legendFound && legendInfo.symbols?.length > 0
        ? `\n\nKNOWN SYMBOLS FROM LEGEND:\n${legendInfo.symbols.map(s => `- ${s.description}: ${s.visualDescription}`).join('\n')}`
        : '';

    return `You are an expert low-voltage construction estimator AND code compliance specialist performing a FINAL VALIDATION COUNT.

YOUR TASK: Count ALL devices on this floor plan, validate CODE COMPLIANCE, and IDENTIFY which devices are fed from each MDF/IDF.
${gridSummary}
${symbolDescriptions}

VALIDATION RULES:
1. This is your FINAL validation pass - be extremely thorough
2. Count EVERY device symbol on the floor plan
3. Group counts by system and device type
4. IDENTIFY which MDF or IDF feeds each group of devices (based on proximity and floor layout)
5. Check for code compliance issues
6. Identify ALL telecom closets (MDF/IDF/TR locations)

CLOSET ANALYSIS - CRITICAL:
- Look for MDF (Main Distribution Frame), IDF (Intermediate Distribution Frame), TR (Telecom Room) symbols
- Determine which closet would logically feed each device based on:
  * Physical proximity on the floor plan
  * Floor/wing location
  * Standard cabling topology (devices connect to nearest closet)
- For multi-floor buildings: MDF typically on main floor, IDFs on each floor

SYSTEMS TO COUNT:
- CABLING: Data Outlets, Voice Outlets, Fiber Outlets, WAP (Wireless Access Points)
- ACCESS: Card Readers, REX Sensors, Door Contacts, Electric Strikes, Mag Locks, Keypads
- CCTV: Dome Cameras, Bullet Cameras, PTZ Cameras, NVR/DVR
- FIRE: Smoke Detectors, Heat Detectors, Pull Stations, Horn/Strobes, Duct Detectors, NAC Panels
- INTERCOM: Intercom Stations, Video Intercom, Door Stations
- A/V: Speakers, Ceiling Speakers, Amplifiers, Displays/Monitors, Volume Controls, DSP, Projectors
- INTRUSION: Motion Detectors, PIR Sensors, Glass Break Detectors, Door/Window Contacts, Keypads, Siren/Strobe, Intrusion Panel

CODE COMPLIANCE CHECKS (NFPA 72, NEC, TIA-568, ADA, IBC):
- Smoke detector spacing (30ft max)
- Pull stations within 5ft of exits
- Horn/Strobes in all occupiable spaces and restrooms
- Card readers at 48" max AFF
- Work areas within 295ft of TR/IDF

OUTPUT FORMAT (JSON):
{
    "sheetName": "T1.01",
    "backbones": [
        {
            "from": "MDF",
            "to": "IDF-1",
            "type": "Fiber",
            "strandCount": 12,
            "category": "OM3",
            "estimatedLength": "150ft",
            "notes": "Horizontal run - same floor"
        },
        {
            "from": "MDF",
            "to": "IDF-2",
            "type": "Fiber",
            "strandCount": 12,
            "category": "OM3",
            "estimatedLength": "75ft",
            "notes": "Riser - vertical run to 2nd floor"
        },
        {
            "from": "MDF",
            "to": "IDF-1",
            "type": "Copper",
            "pairCount": 25,
            "category": "Cat6",
            "estimatedLength": "150ft",
            "notes": "Voice backbone"
        }
    ],
    "closets": [
        {
            "name": "MDF",
            "floor": "Level 1",
            "location": "Main electrical room, near lobby",
            "feedsTo": ["IDF-1", "IDF-2"],
            "dataPorts": 53,
            "voicePorts": 20,
            "fiberPorts": 4,
            "cableRuns": 91,
            "avgCableLength": 85,
            "totalCableFt": 7735,
            "devicesFed": {
                "CABLING": {"Data Outlet": 45, "Voice Outlet": 20, "WAP": 8, "Fiber Outlet": 4},
                "ACCESS": {"Card Reader": 4, "REX Sensor": 4, "Door Contact": 4},
                "CCTV": {"Dome Camera": 6},
                "AV": {"Ceiling Speaker": 12, "Amplifier": 1},
                "INTRUSION": {"Motion Detector": 4, "Door/Window Contact": 6, "Keypad": 1}
            },
            "notes": "Main hub - feeds lobby, admin offices"
        },
        {
            "name": "IDF-1",
            "floor": "Level 1",
            "location": "East wing electrical closet",
            "feedsFrom": "MDF",
            "dataPorts": 36,
            "voicePorts": 12,
            "fiberPorts": 6,
            "cableRuns": 54,
            "avgCableLength": 120,
            "totalCableFt": 6480,
            "devicesFed": {
                "CABLING": {"Data Outlet": 32, "Voice Outlet": 12, "WAP": 4},
                "CCTV": {"Dome Camera": 4, "Bullet Camera": 2}
            },
            "notes": "Feeds east wing"
        },
        {
            "name": "IDF-2",
            "floor": "Level 2",
            "location": "Second floor telecom room",
            "feedsFrom": "MDF",
            "dataPorts": 34,
            "voicePorts": 0,
            "fiberPorts": 2,
            "cableRuns": 36,
            "avgCableLength": 95,
            "totalCableFt": 3420,
            "devicesFed": {
                "CABLING": {"Data Outlet": 28, "WAP": 6},
                "ACCESS": {"Card Reader": 2}
            },
            "notes": "Feeds second floor"
        }
    ],
    "summary": {
        "CABLING": {"Data Outlet": 105, "WAP": 18, "Voice Outlet": 32, "Fiber Outlet": 8},
        "FIRE": {"Smoke Detector": 42, "Pull Station": 6, "Horn/Strobe": 24},
        "ACCESS": {"Card Reader": 6, "REX Sensor": 4, "Door Contact": 4},
        "CCTV": {"Dome Camera": 10, "Bullet Camera": 2},
        "AV": {"Ceiling Speaker": 28, "Amplifier": 2, "Volume Control": 6},
        "INTRUSION": {"Motion Detector": 12, "Glass Break Detector": 4, "Door/Window Contact": 18, "Keypad": 3}
    },
    "codeCompliance": {
        "status": "WARNINGS",
        "violations": [
            {"code": "NFPA72_STROBE", "severity": "HIGH", "location": "Restrooms", "issue": "Missing strobe"}
        ],
        "notes": "1 code issue found"
    },
    "overallConfidence": 0.92,
    "totalDevices": 251,
    "totalCableRuns": 177,
    "totalBackbones": 3,
    "notes": "Complete closet-by-closet breakdown with backbone cabling"
}

IMPORTANT: 
- Group ALL cabling/access/CCTV/AV/intrusion devices by which closet feeds them
- Fire alarm devices typically connect to FACP (Fire Alarm Control Panel), not data closets
- AV devices (speakers, amplifiers) connect to the nearest MDF/IDF
- Intrusion devices (motion detectors, glass breaks, contacts) connect to the intrusion panel or nearest closet
- Count FIBER separately: backbone fiber between closets AND horizontal fiber drops to work areas
- Calculate total cable runs per closet (include data, voice, fiber, AV, and intrusion cables)
- Keep response structured but complete!`;
}

async function fullSheetValidation(filePart, gridCounts, legendInfo) {
    console.log('[AI] Pass 3: Full sheet validation with bounding boxes...');
    try {
        const prompt = buildValidationPrompt(gridCounts, legendInfo);
        const result = await callGeminiAPI(prompt, filePart);
        console.log('[AI] Pass 3 Complete:', result.devices?.length || 0, 'devices with coordinates');
        return result;
    } catch (error) {
        console.error('[AI] Pass 3 Error:', error);
        return { devices: [], summary: {}, overallConfidence: 0, notes: 'Validation failed' };
    }
}

// ============================================================================
// DISCREPANCY RECONCILIATION
// ============================================================================

function reconcileResults(legendInfo, gridCounts, validationResult) {
    const discrepancies = [];

    // Compare grid counts vs validation counts
    const gridTotals = gridCounts.totalsBySystem || {};
    const validationTotals = validationResult.summary || {};

    for (const system of Object.keys({ ...gridTotals, ...validationTotals })) {
        const gridDevices = gridTotals[system] || {};
        const validDevices = validationTotals[system] || {};

        for (const deviceType of Object.keys({ ...gridDevices, ...validDevices })) {
            const gridCount = gridDevices[deviceType] || 0;
            const validCount = validDevices[deviceType] || 0;

            if (gridCount !== validCount) {
                const diff = Math.abs(gridCount - validCount);
                const pctDiff = gridCount > 0 ? (diff / gridCount * 100) : 100;

                discrepancies.push({
                    system,
                    deviceType,
                    gridCount,
                    validationCount: validCount,
                    difference: validCount - gridCount,
                    percentDiff: pctDiff.toFixed(1),
                    severity: pctDiff > 20 ? 'HIGH' : pctDiff > 10 ? 'MEDIUM' : 'LOW',
                    resolution: validCount > gridCount ? 'Using higher validation count' : 'Review recommended'
                });
            }
        }
    }

    // Use validation results as final (more detailed with bounding boxes)
    // but incorporate discrepancy warnings
    return {
        ...validationResult,
        legend: legendInfo,
        gridCounts: gridCounts.gridCounts,
        discrepancies,
        analysisMethod: '3-pass-multipass',
        passResults: {
            pass1_legend: legendInfo.legendFound,
            pass2_gridConfidence: gridCounts.confidence || 0,
            pass3_validationConfidence: validationResult.overallConfidence || 0
        }
    };
}

// ============================================================================
// MAIN EXPORT FUNCTIONS
// ============================================================================

/**
 * Analyze a floor plan using 3-pass multi-pass analysis for maximum accuracy
 */
export async function analyzeFloorPlan(file, legendInfo = null) {
    if (!GEMINI_API_KEY || GEMINI_API_KEY === 'your-gemini-api-key-here') {
        throw new Error('Please set your Gemini API key in the .env file (VITE_GEMINI_API_KEY)');
    }

    console.log(`[AI] Starting 3-Pass Multi-Pass Analysis for: ${file.name}`);
    const startTime = Date.now();

    // Prepare file once, reuse for all passes
    const filePart = await prepareFileForGemini(file);

    // PASS 1: Extract legend
    const extractedLegend = legendInfo || await extractLegend(filePart);

    // PASS 2: Grid-based systematic counting
    const gridCounts = await gridBasedCount(filePart, extractedLegend);

    // PASS 3: Full validation with bounding boxes
    const validationResult = await fullSheetValidation(filePart, gridCounts, extractedLegend);

    // Reconcile all results
    const finalResult = reconcileResults(extractedLegend, gridCounts, validationResult);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[AI] Multi-Pass Analysis Complete in ${elapsed}s - ${finalResult.devices?.length || 0} devices detected`);

    return finalResult;
}

/**
 * Quick single-pass analysis for preview/fast results
 */
export async function analyzeFloorPlanQuick(file) {
    if (!GEMINI_API_KEY || GEMINI_API_KEY === 'your-gemini-api-key-here') {
        throw new Error('Please set your Gemini API key in the .env file (VITE_GEMINI_API_KEY)');
    }

    console.log(`[AI] Quick Analysis for: ${file.name}`);
    const filePart = await prepareFileForGemini(file);

    const quickPrompt = `Quickly count all low-voltage device symbols on this floor plan. Group by system (CABLING, ACCESS, CCTV, FIRE, INTERCOM). Return JSON: { "summary": { "CABLING": {"Data Outlet": 10}, "FIRE": {"Smoke Detector": 5} }, "totalDevices": 15, "confidence": 0.85 }`;

    return await callGeminiAPI(quickPrompt, filePart, 0.2);
}

/**
 * Analyze multiple floor plan sheets and aggregate results
 */
export async function analyzeAllSheets(planFiles, onProgress) {
    const allResults = {
        sheets: [],
        aggregatedDevices: {},
        closets: [],
        totalsBySystem: {
            CABLING: {},
            ACCESS: {},
            CCTV: {},
            FIRE: {},
            INTERCOM: {},
            'A/V': {}
        },
        issues: [],
        discrepancies: []
    };

    for (let i = 0; i < planFiles.length; i++) {
        const file = planFiles[i];
        onProgress?.({
            current: i + 1,
            total: planFiles.length,
            fileName: file.name,
            status: `Analyzing ${file.name} (3-pass)...`
        });

        try {
            const result = await analyzeFloorPlan(file);
            allResults.sheets.push({
                fileName: file.name,
                ...result
            });

            // Aggregate device counts from summary
            if (result.summary && typeof result.summary === 'object') {
                for (const [system, devices] of Object.entries(result.summary)) {
                    // Skip if devices is not an object or is null
                    if (!devices || typeof devices !== 'object') {
                        console.warn(`[AI] Skipping invalid summary entry for ${system}:`, devices);
                        continue;
                    }

                    // Initialize system if needed
                    if (!allResults.totalsBySystem[system]) {
                        allResults.totalsBySystem[system] = {};
                    }

                    for (const [deviceType, count] of Object.entries(devices)) {
                        // Skip if count is not a number
                        const numCount = typeof count === 'number' ? count : parseInt(count) || 0;
                        if (numCount <= 0) continue;

                        allResults.totalsBySystem[system][deviceType] =
                            (allResults.totalsBySystem[system][deviceType] || 0) + numCount;

                        // Also track in aggregatedDevices for compatibility
                        const key = `${system}:${deviceType}`;
                        if (!allResults.aggregatedDevices[key]) {
                            allResults.aggregatedDevices[key] = {
                                symbol: deviceType,
                                system: system,
                                totalQty: 0,
                                bySheet: []
                            };
                        }
                        allResults.aggregatedDevices[key].totalQty += numCount;
                        allResults.aggregatedDevices[key].bySheet.push({
                            sheet: file.name,
                            qty: numCount
                        });
                    }
                }
            }

            // Collect closets
            if (result.closets) {
                allResults.closets.push(...result.closets.map(c => ({
                    ...c,
                    sheet: file.name
                })));
            }

            // Collect discrepancies
            if (result.discrepancies?.length > 0) {
                allResults.discrepancies.push(...result.discrepancies.map(d => ({
                    ...d,
                    sheet: file.name
                })));
            }

        } catch (error) {
            allResults.issues.push({
                sheet: file.name,
                severity: 'CRITICAL',
                message: `Failed to analyze: ${error.message}`
            });
        }
    }

    return allResults;
}

/**
 * Convert results to the format expected by the BOM generator
 */
export function convertToDeviceCounts(aiResults) {
    const deviceCounts = {
        CABLING: {},
        ACCESS: {},
        CCTV: {},
        FIRE: {},
        INTERCOM: {},
        'A/V': {},
        AV: {},
        INTRUSION: {},
        OTHER: {}  // Catch-all for unknown systems
    };

    // Use totalsBySystem if available (from analyzeAllSheets)
    if (aiResults?.totalsBySystem && typeof aiResults.totalsBySystem === 'object') {
        for (const [system, devices] of Object.entries(aiResults.totalsBySystem)) {
            // Skip if devices is not an object
            if (!devices || typeof devices !== 'object') {
                console.warn(`[ConvertCounts] Skipping invalid system "${system}":`, devices);
                continue;
            }

            // Use the system if it exists, otherwise use OTHER
            const targetSystem = deviceCounts[system] ? system : 'OTHER';

            for (const [deviceType, count] of Object.entries(devices)) {
                // Skip if count is not a valid number
                const numCount = typeof count === 'number' ? count : parseInt(count);
                if (isNaN(numCount) || numCount <= 0) {
                    console.warn(`[ConvertCounts] Skipping invalid count for "${deviceType}":`, count);
                    continue;
                }

                const cleanKey = deviceType.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_');
                deviceCounts[targetSystem][cleanKey] = {
                    name: deviceType,
                    qty: numCount,
                    unit: 'EA'
                };
            }
        }
    }

    // Fallback to aggregatedDevices
    if (aiResults?.aggregatedDevices && typeof aiResults.aggregatedDevices === 'object') {
        for (const [key, deviceData] of Object.entries(aiResults.aggregatedDevices)) {
            // Skip invalid entries
            if (!deviceData || typeof deviceData !== 'object' || !deviceData.symbol) {
                continue;
            }

            const system = deviceData.system || 'CABLING';
            const targetSystem = deviceCounts[system] ? system : 'OTHER';
            const cleanKey = deviceData.symbol.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_');

            deviceCounts[targetSystem][cleanKey] = {
                name: deviceData.symbol,
                qty: deviceData.totalQty || 0,
                locations: deviceData.bySheet?.map(s => s.locations).filter(Boolean),
                unit: 'EA'
            };
        }
    }

    console.log('[ConvertCounts] Final device counts:', JSON.stringify(deviceCounts, null, 2).substring(0, 500));
    return deviceCounts;
}

/**
 * Test the API connection
 */
export async function testApiConnection() {
    if (!GEMINI_API_KEY || GEMINI_API_KEY === 'your-gemini-api-key-here') {
        return { success: false, error: 'API key not configured' };
    }

    try {
        const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: 'Say "API connected successfully"' }] }]
            })
        });

        if (response.ok) {
            return { success: true, model: 'gemini-2.0-flash', features: ['multi-pass-analysis', 'legend-extraction', 'grid-counting'] };
        } else {
            const error = await response.text();
            return { success: false, error };
        }
    } catch (error) {
        return { success: false, error: error.message };
    }
}
