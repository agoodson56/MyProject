import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Upload, FileText, Zap, CheckCircle, AlertTriangle, ChevronRight, X, Download, Eye, Settings, Layers, Cable, Shield, Camera, Flame, Building, Grid3X3, BarChart3, FileSpreadsheet, AlertCircle, Loader2, Plus, Trash2, User, Clock, ClipboardList, FolderOpen, ArrowLeft, Save, Lock, Unlock, KeyRound } from 'lucide-react';
import DetailedBOM, { generateDetailedBOM } from './src/components/DetailedBOM.jsx';
import ProjectManagerPortal from './src/components/ProjectManagerPortal.jsx';
import SettingsPortal, { DEFAULT_SETTINGS } from './src/components/SettingsPortal.jsx';
import FloorPlanOverlay from './src/components/FloorPlanOverlay.jsx';
import ProjectDashboard from './src/components/ProjectDashboard.jsx';
import { analyzeFloorPlan, analyzeAllSheets, convertToDeviceCounts } from './src/services/blueprintAnalyzer.js';
import { parseSpecification, crossReferenceSpecVsPlan } from './src/services/specificationParser.js';
import { getProject, createProject, updateProject, getProgress, saveProgress } from './src/services/cloudStorage.js';

// Main Application Component
export default function LVTakeoffSystem() {
  const [currentStep, setCurrentStep] = useState(0);
  const [planFiles, setPlanFiles] = useState([]);
  const [specFiles, setSpecFiles] = useState([]);
  const [projectName, setProjectName] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState('');
  const [processingProgress, setProcessingProgress] = useState(0);
  const [results, setResults] = useState(null);
  const [activeTab, setActiveTab] = useState('summary');
  const [selectedSheet, setSelectedSheet] = useState(null);
  const [showLegendEditor, setShowLegendEditor] = useState(false);
  const [detectedSymbols, setDetectedSymbols] = useState([]);
  const [confirmedSymbols, setConfirmedSymbols] = useState([]);
  const [projectSettings, setProjectSettings] = useState(DEFAULT_SETTINGS);
  const [userRole, setUserRole] = useState('viewer'); // 'estimator', 'pm', 'viewer'
  // Op's MGR password is hardcoded and same for ALL projects
  const OPS_MGR_PASSWORD = '35C0S1991';
  const [passwords, setPasswords] = useState({ estimator: OPS_MGR_PASSWORD, pm: 'PM1234' });
  const [showPasswordModal, setShowPasswordModal] = useState(null); // null or role name
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [showOverlay, setShowOverlay] = useState(false); // Floor plan verification overlay
  const [detectedDevices, setDetectedDevices] = useState([]); // AI-detected devices with coordinates
  const [useAiAnalysis, setUseAiAnalysis] = useState(true); // AI Analysis ON by default

  // Cloud storage state
  const [showDashboard, setShowDashboard] = useState(true); // Show project dashboard first
  const [activeProject, setActiveProject] = useState(null); // Current project from cloud
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);

  // Debug logging
  console.log('🏠 LVTakeoffSystem RENDER - showDashboard:', showDashboard);

  const steps = [
    { id: 0, name: 'Upload Files', icon: Upload },
    { id: 1, name: 'Review Legends', icon: Layers },
    { id: 2, name: 'Processing', icon: Zap },
    { id: 3, name: 'Results', icon: BarChart3 }
  ];

  const systemIcons = {
    'CABLING': Cable,
    'ACCESS': Shield,
    'CCTV': Camera,
    'FIRE': Flame,
    // AI-generated system names
    'DATACOM': Cable,
    'SECURITY': Shield,
    'ACCESS CONTROL': Shield,
    'A/V': Camera
  };

  // Map display system names to settings keys
  const systemKeyMap = {
    'CABLING': 'cabling',
    'DATACOM': 'cabling',
    'ACCESS': 'access',
    'ACCESS CONTROL': 'access',
    'CCTV': 'cctv',
    'SECURITY': 'cctv',
    'FIRE': 'fire',
    'A/V': 'audioVisual',
    'INTERCOM': 'intercom'
  };

  // Check if a system is enabled in settings
  const isSystemEnabled = (systemName) => {
    const key = systemKeyMap[systemName] || systemName.toLowerCase();
    return projectSettings?.systems?.[key] !== false; // default to enabled if not set
  };

  // Filter results by enabled systems
  const getFilteredDeviceCounts = () => {
    if (!results?.deviceCounts) return {};
    return Object.fromEntries(
      Object.entries(results.deviceCounts).filter(([system]) => isSystemEnabled(system))
    );
  };

  const getFilteredMasterBom = () => {
    if (!results?.masterBom) return [];
    return results.masterBom.filter(item => isSystemEnabled(item.system));
  };

  const getFilteredCableSummary = () => {
    if (!results?.cableSummary) return {};
    return Object.fromEntries(
      Object.entries(results.cableSummary).filter(([_, data]) => isSystemEnabled(data.system))
    );
  };

  // =================================================================
  // DYNAMIC CALCULATIONS - Auto-update based on projectSettings
  // =================================================================

  // Get cabling settings with defaults
  const getCablingSettings = () => ({
    avgCableRunLength: projectSettings?.cabling?.avgCableRunLength || 100,
    serviceLoopLength: projectSettings?.cabling?.serviceLoopLength || 10,
    wastePercentage: projectSettings?.cabling?.wastePercentage || 5,
    jHookSpacing: projectSettings?.cabling?.jHookSpacing || 8,
    feetPerBox: projectSettings?.cabling?.feetPerBox || 1000
  });

  // Calculate total device count for a system
  const getSystemDeviceCount = (systemName) => {
    const deviceCounts = getFilteredDeviceCounts();
    const systemDevices = deviceCounts[systemName];
    if (!systemDevices) return 0;
    return Object.values(systemDevices).reduce((sum, d) => sum + (d.qty || 0), 0);
  };

  // Calculate total cable runs (number of drops/devices that need cable)
  const getTotalCableRuns = () => {
    const deviceCounts = getFilteredDeviceCounts();
    let totalRuns = 0;

    // CABLING system - each outlet/WAP is a cable run
    if (deviceCounts['CABLING']) {
      Object.entries(deviceCounts['CABLING']).forEach(([deviceType, data]) => {
        if (['Data Outlet', 'Voice Outlet', 'WAP', 'Fiber Outlet'].includes(deviceType)) {
          totalRuns += data.qty || 0;
        }
      });
    }
    // Handle alternate naming
    if (deviceCounts['DATACOM']) {
      Object.values(deviceCounts['DATACOM']).forEach(data => {
        totalRuns += data.qty || 0;
      });
    }

    return totalRuns;
  };

  // Calculate dynamic cable summary based on device counts and settings
  const getDynamicCableSummary = () => {
    const settings = getCablingSettings();
    const deviceCounts = getFilteredDeviceCounts();
    const wasteFactor = 1 + (settings.wastePercentage / 100);

    // Count devices by system
    const cablingDevices = deviceCounts['CABLING'] || deviceCounts['DATACOM'] || {};
    const dataOutlets = (cablingDevices['Data Outlet']?.qty || 0);
    const voiceOutlets = (cablingDevices['Voice Outlet']?.qty || 0);
    const waps = (cablingDevices['WAP']?.qty || 0);
    const fiberOutlets = (cablingDevices['Fiber Outlet']?.qty || 0);

    const accessDevices = deviceCounts['ACCESS'] || deviceCounts['ACCESS CONTROL'] || {};
    const cardReaders = (accessDevices['Card Reader']?.qty || 0);
    const rexSensors = (accessDevices['REX Sensor']?.qty || 0);
    const doorContacts = (accessDevices['Door Contact']?.qty || 0);
    const totalAccessDevices = cardReaders + rexSensors + doorContacts;

    const cctvDevices = deviceCounts['CCTV'] || deviceCounts['SECURITY'] || {};
    const totalCameras = Object.values(cctvDevices).reduce((sum, d) => sum + (d.qty || 0), 0);

    const fireDevices = deviceCounts['FIRE'] || {};
    const smokeDetectors = (fireDevices['Smoke Detector']?.qty || 0);
    const heatDetectors = (fireDevices['Heat Detector']?.qty || 0);
    const pullStations = (fireDevices['Pull Station']?.qty || 0);
    const hornStrobes = (fireDevices['Horn/Strobe']?.qty || 0);
    const totalFireDevices = smokeDetectors + heatDetectors + pullStations + hornStrobes;

    // Calculate cable lengths using settings
    const cablePerRun = settings.avgCableRunLength + settings.serviceLoopLength;

    return {
      'CAT6A Plenum': {
        system: 'CABLING',
        totalFt: Math.round((dataOutlets + waps) * cablePerRun * wasteFactor),
        boxes: Math.ceil((dataOutlets + waps) * cablePerRun * wasteFactor / settings.feetPerBox),
        waste: wasteFactor
      },
      'CAT6A (Voice)': {
        system: 'CABLING',
        totalFt: Math.round(voiceOutlets * cablePerRun * wasteFactor),
        boxes: Math.ceil(voiceOutlets * cablePerRun * wasteFactor / settings.feetPerBox),
        waste: wasteFactor
      },
      'OM4 Fiber': {
        system: 'CABLING',
        totalFt: Math.round(fiberOutlets * 100 * wasteFactor), // Fiber uses fixed 100ft avg for backbone
        boxes: Math.ceil(fiberOutlets * 100 * wasteFactor / settings.feetPerBox),
        waste: wasteFactor
      },
      '18/4 Shielded': {
        system: 'ACCESS',
        totalFt: Math.round(cardReaders * cablePerRun * wasteFactor),
        boxes: Math.ceil(cardReaders * cablePerRun * wasteFactor / settings.feetPerBox),
        waste: wasteFactor
      },
      '22/6 Shielded': {
        system: 'ACCESS',
        totalFt: Math.round((rexSensors + doorContacts) * cablePerRun * 0.5 * wasteFactor), // Shorter runs
        boxes: Math.ceil((rexSensors + doorContacts) * cablePerRun * 0.5 * wasteFactor / settings.feetPerBox),
        waste: wasteFactor
      },
      'CAT6 (CCTV)': {
        system: 'CCTV',
        totalFt: Math.round(totalCameras * cablePerRun * wasteFactor),
        boxes: Math.ceil(totalCameras * cablePerRun * wasteFactor / settings.feetPerBox),
        waste: wasteFactor
      },
      '18/2 FPLP': {
        system: 'FIRE',
        totalFt: Math.round((smokeDetectors + heatDetectors) * cablePerRun * 0.5 * wasteFactor), // SLC daisy-chain
        boxes: Math.ceil((smokeDetectors + heatDetectors) * cablePerRun * 0.5 * wasteFactor / settings.feetPerBox),
        waste: wasteFactor
      },
      '14/2 FPLP': {
        system: 'FIRE',
        totalFt: Math.round((pullStations + hornStrobes) * cablePerRun * 0.5 * wasteFactor), // NAC circuit
        boxes: Math.ceil((pullStations + hornStrobes) * cablePerRun * 0.5 * wasteFactor / settings.feetPerBox),
        waste: wasteFactor
      }
    };
  };

  // Calculate dynamic J-hook count based on cable runs and settings
  // CAT64HP J-hooks can hold up to 64 cables each
  // J-hooks are placed every X feet (jHookSpacing) along the main run
  const getDynamicJHookCount = () => {
    const settings = getCablingSettings();
    const totalCableRuns = getTotalCableRuns();
    const jHookCapacity = settings.jHookCapacity || 64; // CAT64HP = 64 cables max
    const jHookSpacing = settings.jHookSpacing || 8; // Default 8 feet
    const avgCableRunLength = settings.avgCableRunLength || 100;

    // Calculate total cable footage for main run estimation
    // Main run is the backbone that carries bundled cables
    const mainRunLength = avgCableRunLength * 0.7; // ~70% of cable run is main pathway

    // Number of J-hook locations along the main run
    const jHookLocations = Math.ceil(mainRunLength / jHookSpacing);

    // At each location, calculate how many J-hooks needed based on cable count
    // Cables are bundled together in the main run, then branch to individual drops
    const jHooksPerLocation = Math.ceil(totalCableRuns / jHookCapacity);

    // Total J-hooks = locations × J-hooks per location
    const totalJHooks = jHookLocations * jHooksPerLocation;

    // Minimum of 1 J-hook per cable run for the branch portion (last segment to device)
    const branchJHooks = totalCableRuns; // 1 J-hook per run for the branch

    return totalJHooks + branchJHooks;
  };

  // Calculate dynamic total cable footage
  const getDynamicTotalCableFt = () => {
    const cableSummary = getDynamicCableSummary();
    return Object.values(cableSummary)
      .filter((_, idx) => isSystemEnabled(Object.keys(cableSummary)[idx]))
      .reduce((sum, cable) => sum + cable.totalFt, 0);
  };

  // Generate dynamic BOM items based on device counts and settings
  // Includes estimated pricing and labor hours for proposal generation
  const getDynamicBomItems = () => {
    const settings = getCablingSettings();
    const deviceCounts = getFilteredDeviceCounts();
    const cableSummary = getDynamicCableSummary();
    const wasteFactor = 1 + (settings.wastePercentage / 100);

    // Get device quantities
    const cablingDevices = deviceCounts['CABLING'] || deviceCounts['DATACOM'] || {};
    const accessDevices = deviceCounts['ACCESS'] || deviceCounts['ACCESS CONTROL'] || {};
    const cctvDevices = deviceCounts['CCTV'] || deviceCounts['SECURITY'] || {};
    const fireDevices = deviceCounts['FIRE'] || {};

    const dataOutlets = cablingDevices['Data Outlet']?.qty || 0;
    const voiceOutlets = cablingDevices['Voice Outlet']?.qty || 0;
    const waps = cablingDevices['WAP']?.qty || 0;
    const fiberOutlets = cablingDevices['Fiber Outlet']?.qty || 0;

    const cardReaders = accessDevices['Card Reader']?.qty || 0;
    const rexSensors = accessDevices['REX Sensor']?.qty || 0;
    const doorContacts = accessDevices['Door Contact']?.qty || 0;
    const electricStrikes = accessDevices['Electric Strike']?.qty || 0;
    const magLocks = accessDevices['Mag Lock']?.qty || 0;

    const domeCameras = cctvDevices['Dome Camera']?.qty || 0;
    const bulletCameras = cctvDevices['Bullet Camera']?.qty || 0;
    const ptzCameras = cctvDevices['PTZ Camera']?.qty || 0;
    const totalCameras = domeCameras + bulletCameras + ptzCameras;

    const smokeDetectors = fireDevices['Smoke Detector']?.qty || 0;
    const heatDetectors = fireDevices['Heat Detector']?.qty || 0;
    const pullStations = fireDevices['Pull Station']?.qty || 0;
    const hornStrobes = fireDevices['Horn/Strobe']?.qty || 0;

    const totalDoors = Math.max(cardReaders, rexSensors, doorContacts) || 32;
    const jHookCount = getDynamicJHookCount();

    return [
      // === CABLING / STRUCTURED ===
      { system: 'CABLING', category: 'Horizontal Cable', description: 'CAT6A Plenum Cable, Blue', manufacturer: 'Belden', sku: '10GXS12', unit: 'FT', qty: cableSummary['CAT6A Plenum']?.totalFt || 0, unitCost: 0.42, laborHrs: 0.008, notes: `${settings.avgCableRunLength}ft avg + ${settings.serviceLoopLength}ft loop + ${settings.wastePercentage}% waste` },
      { system: 'CABLING', category: 'Horizontal Cable', description: 'CAT6A Plenum Cable, White (Voice)', manufacturer: 'Belden', sku: '10GXS12-WHT', unit: 'FT', qty: cableSummary['CAT6A (Voice)']?.totalFt || 0, unitCost: 0.42, laborHrs: 0.008, notes: 'Voice runs' },
      { system: 'CABLING', category: 'Backbone Cable', description: 'OM4 50/125 Fiber, 12-strand', manufacturer: 'Corning', sku: '012T88-33131', unit: 'FT', qty: cableSummary['OM4 Fiber']?.totalFt || 0, unitCost: 2.85, laborHrs: 0.02, notes: 'MDF to IDF risers' },
      { system: 'CABLING', category: 'Outlet', description: 'Data Outlet - CAT6A Jack, Blue', manufacturer: 'Panduit', sku: 'CJ6X88TGBU', unit: 'EA', qty: dataOutlets, unitCost: 12.50, laborHrs: 0.15, notes: 'Per plan count' },
      { system: 'CABLING', category: 'Outlet', description: 'Voice Outlet - CAT6A Jack, White', manufacturer: 'Panduit', sku: 'CJ6X88TGWH', unit: 'EA', qty: voiceOutlets, unitCost: 12.50, laborHrs: 0.15, notes: 'Per plan count' },
      { system: 'CABLING', category: 'Faceplate', description: 'Faceplate - 2-Port, White', manufacturer: 'Panduit', sku: 'CFPE2WHY', unit: 'EA', qty: Math.ceil((dataOutlets + voiceOutlets) / 2), unitCost: 3.25, laborHrs: 0.05, notes: 'Data/voice combo' },
      { system: 'CABLING', category: 'Faceplate', description: 'Faceplate - 1-Port, White', manufacturer: 'Panduit', sku: 'CFPE1WHY', unit: 'EA', qty: Math.ceil(waps * 0.25), unitCost: 2.50, laborHrs: 0.05, notes: 'Single jack locations' },
      { system: 'CABLING', category: 'Surface Box', description: 'Surface Mount Box 2-Port', manufacturer: 'Panduit', sku: 'CBX2WH-A', unit: 'EA', qty: Math.ceil((dataOutlets + voiceOutlets) * 0.1), unitCost: 8.00, laborHrs: 0.10, notes: 'Exposed locations' },
      { system: 'CABLING', category: 'WAP', description: 'Wireless Access Point', manufacturer: 'Cisco', sku: 'C9120AXI-B', unit: 'EA', qty: waps, unitCost: 1250.00, laborHrs: 0.5, notes: 'Per plan count' },
      { system: 'CABLING', category: 'WAP Mount', description: 'WAP Mounting Bracket', manufacturer: 'Cisco', sku: 'AIR-AP-BRACKET-1', unit: 'EA', qty: waps, unitCost: 35.00, laborHrs: 0.25, notes: '1 per WAP' },
      { system: 'CABLING', category: 'Patch Panel', description: '48-Port CAT6A Patch Panel', manufacturer: 'Panduit', sku: 'CP48BLY', unit: 'EA', qty: Math.ceil((dataOutlets + voiceOutlets) / 48), unitCost: 385.00, laborHrs: 1.5, notes: 'Per port counts' },
      { system: 'CABLING', category: 'Patch Panel', description: '24-Port CAT6A Patch Panel', manufacturer: 'Panduit', sku: 'CP24BLY', unit: 'EA', qty: Math.ceil(waps / 24), unitCost: 225.00, laborHrs: 1.0, notes: 'For WAPs' },
      { system: 'CABLING', category: 'Rack', description: '42U 4-Post Rack', manufacturer: 'Chatsworth', sku: '57089-703', unit: 'EA', qty: 2, unitCost: 1850.00, laborHrs: 4.0, notes: 'MDF location' },
      { system: 'CABLING', category: 'Rack', description: '2-Post Relay Rack 7ft', manufacturer: 'Chatsworth', sku: '11307-712', unit: 'EA', qty: 3, unitCost: 425.00, laborHrs: 2.0, notes: 'IDF locations' },
      { system: 'CABLING', category: 'Cable Manager', description: 'Vertical Cable Manager', manufacturer: 'Panduit', sku: 'WMPVF45E', unit: 'EA', qty: 10, unitCost: 285.00, laborHrs: 0.5, notes: '4 MDF + 2 per IDF' },
      { system: 'CABLING', category: 'Cable Manager', description: 'Horizontal Cable Manager 2U', manufacturer: 'Panduit', sku: 'WMPF2E', unit: 'EA', qty: 20, unitCost: 95.00, laborHrs: 0.25, notes: 'Between panels' },
      { system: 'CABLING', category: 'Patch Cord', description: 'CAT6A Patch Cord 3ft Blue', manufacturer: 'Panduit', sku: 'UTP6AX3BU', unit: 'EA', qty: dataOutlets, unitCost: 8.50, laborHrs: 0.02, notes: 'Equipment side' },
      { system: 'CABLING', category: 'Patch Cord', description: 'CAT6A Patch Cord 7ft Blue', manufacturer: 'Panduit', sku: 'UTP6AX7BU', unit: 'EA', qty: Math.ceil(dataOutlets * 0.3), unitCost: 12.00, laborHrs: 0.02, notes: 'Cross-connects' },
      { system: 'CABLING', category: 'Patch Cord', description: 'CAT6A Patch Cord 3ft White', manufacturer: 'Panduit', sku: 'UTP6AX3WH', unit: 'EA', qty: voiceOutlets, unitCost: 8.50, laborHrs: 0.02, notes: 'Voice circuits' },
      { system: 'CABLING', category: 'Fiber Enclosure', description: 'Fiber Enclosure 1U Rack Mount', manufacturer: 'Corning', sku: 'CCH-01U', unit: 'EA', qty: 4, unitCost: 245.00, laborHrs: 0.5, notes: '1 MDF + 3 IDF' },
      { system: 'CABLING', category: 'Fiber Panel', description: 'LC Duplex Adapter Panel 6-Pack', manufacturer: 'Corning', sku: 'CCH-CP06-A9', unit: 'EA', qty: 12, unitCost: 85.00, laborHrs: 0.25, notes: 'OM4 connections' },
      { system: 'CABLING', category: 'Fiber Patch Cord', description: 'OM4 LC-LC Duplex Patch Cord 3m', manufacturer: 'Corning', sku: '002318G8120003M', unit: 'EA', qty: 36, unitCost: 28.00, laborHrs: 0.05, notes: 'Backbone connections' },
      { system: 'CABLING', category: 'Fiber Connector', description: 'LC Connector OM4', manufacturer: 'Corning', sku: '95-050-99-X', unit: 'EA', qty: 72, unitCost: 14.50, laborHrs: 0.25, notes: 'Field terminations' },
      { system: 'CABLING', category: 'Pathway', description: 'J-Hook, 2" (CAT6A Rated)', manufacturer: 'Erico', sku: 'CAT64HP', unit: 'EA', qty: jHookCount, unitCost: 2.15, laborHrs: 0.05, notes: `Every ${settings.jHookSpacing}', up to ${settings.jHookCapacity || 64} cables per hook` },
      { system: 'CABLING', category: 'Pathway', description: 'Ladder Rack 12"', manufacturer: 'B-Line', sku: 'SB1218S12FB', unit: 'FT', qty: 72, unitCost: 18.00, laborHrs: 0.1, notes: 'Closet overhead' },
      { system: 'CABLING', category: 'Pathway', description: 'Basket Tray 12"', manufacturer: 'Cablofil', sku: 'CM30EZ300', unit: 'FT', qty: 150, unitCost: 12.00, laborHrs: 0.08, notes: 'Corridors' },
      { system: 'CABLING', category: 'Velcro', description: 'Velcro Strap Roll', manufacturer: 'Panduit', sku: 'HLM-15R0', unit: 'ROLL', qty: 24, unitCost: 28.00, laborHrs: 0, notes: 'Cable bundling' },
      { system: 'CABLING', category: 'Labels', description: 'Cable Labels (Pre-printed)', manufacturer: 'Brady', sku: 'WML-311-292', unit: 'EA', qty: (dataOutlets + voiceOutlets + waps) * 2, unitCost: 0.35, laborHrs: 0.02, notes: 'Per TIA-606 standard' },
      { system: 'CABLING', category: 'Power', description: 'Power Strip 20A', manufacturer: 'Tripp Lite', sku: 'PDUMV20', unit: 'EA', qty: 8, unitCost: 245.00, laborHrs: 0.5, notes: 'Rack PDUs' },
      { system: 'CABLING', category: 'Grounding', description: 'Ground Bar Kit', manufacturer: 'Panduit', sku: 'GB4BCV0512TY', unit: 'EA', qty: 4, unitCost: 125.00, laborHrs: 1.0, notes: 'Per closet' },
      { system: 'CABLING', category: 'UPS', description: 'UPS 3000VA Rack Mount', manufacturer: 'APC', sku: 'SMT3000RM2U', unit: 'EA', qty: 2, unitCost: 1650.00, laborHrs: 2.0, notes: 'Critical racks' },
      { system: 'CABLING', category: 'Firestop', description: 'Firestop Putty Pad', manufacturer: '3M', sku: 'MPP+', unit: 'EA', qty: 24, unitCost: 28.00, laborHrs: 0.5, notes: 'Penetrations' },
      { system: 'CABLING', category: 'Firestop', description: 'Firestop Caulk', manufacturer: '3M', sku: 'CP-25WB+', unit: 'TUBE', qty: 12, unitCost: 18.00, laborHrs: 0.25, notes: 'Penetrations' },
      { system: 'CABLING', category: 'Network Switch', description: 'PoE+ Switch 48-Port', manufacturer: 'Cisco', sku: 'CBS350-48FP', unit: 'EA', qty: Math.ceil((dataOutlets + waps) / 48), unitCost: 2850.00, laborHrs: 1.0, notes: 'Active equipment' },

      // === ACCESS CONTROL ===
      { system: 'ACCESS', category: 'Reader', description: 'Card Reader - Multi-Tech, Mullion', manufacturer: 'HID', sku: '920PTNNEK00000', unit: 'EA', qty: cardReaders, unitCost: 285.00, laborHrs: 0.75, notes: 'Entry side' },
      { system: 'ACCESS', category: 'Reader', description: 'Card Reader - Keypad', manufacturer: 'HID', sku: '921PTNNEK00000', unit: 'EA', qty: Math.ceil(cardReaders * 0.25), unitCost: 385.00, laborHrs: 0.75, notes: 'Secure areas' },
      { system: 'ACCESS', category: 'REX', description: 'Request-to-Exit Sensor', manufacturer: 'Bosch', sku: 'DS150I', unit: 'EA', qty: rexSensors || totalDoors, unitCost: 145.00, laborHrs: 0.5, notes: '1 per door' },
      { system: 'ACCESS', category: 'DPS', description: 'Door Position Switch', manufacturer: 'GE', sku: '1076-N', unit: 'EA', qty: doorContacts || totalDoors, unitCost: 28.00, laborHrs: 0.25, notes: '1 per door' },
      { system: 'ACCESS', category: 'Lock', description: 'Electric Strike, Fail-Secure', manufacturer: 'HES', sku: '9600-12/24-630', unit: 'EA', qty: electricStrikes, unitCost: 285.00, laborHrs: 1.0, notes: 'Standard doors' },
      { system: 'ACCESS', category: 'Lock', description: 'Mag Lock, 1200lb', manufacturer: 'Securitron', sku: 'M62', unit: 'EA', qty: magLocks, unitCost: 345.00, laborHrs: 1.5, notes: 'Glass doors' },
      { system: 'ACCESS', category: 'Panel', description: 'Access Control Panel, 4-Door', manufacturer: 'Mercury', sku: 'MR52', unit: 'EA', qty: Math.ceil(totalDoors / 4), unitCost: 1250.00, laborHrs: 2.0, notes: `${totalDoors} doors / 4` },
      { system: 'ACCESS', category: 'Power Supply', description: 'Power Supply 12/24V 6A', manufacturer: 'Altronix', sku: 'AL600ULACM', unit: 'EA', qty: Math.ceil(totalDoors / 4), unitCost: 185.00, laborHrs: 0.5, notes: '1 per panel' },
      { system: 'ACCESS', category: 'Cable', description: '18/4 Shielded Plenum', manufacturer: 'West Penn', sku: '25254B', unit: 'FT', qty: cableSummary['18/4 Shielded']?.totalFt || 0, unitCost: 0.55, laborHrs: 0.008, notes: 'Reader cable' },
      { system: 'ACCESS', category: 'Cable', description: '22/6 Shielded Plenum', manufacturer: 'West Penn', sku: '25226B', unit: 'FT', qty: cableSummary['22/6 Shielded']?.totalFt || 0, unitCost: 0.48, laborHrs: 0.008, notes: 'Lock/REX cable' },

      // === CCTV ===
      { system: 'CCTV', category: 'Camera', description: 'IP Dome Camera, 4MP, Indoor', manufacturer: 'Axis', sku: 'P3245-V', unit: 'EA', qty: domeCameras, unitCost: 685.00, laborHrs: 1.0, notes: 'Interior' },
      { system: 'CCTV', category: 'Camera', description: 'IP Bullet Camera, 4MP, Outdoor', manufacturer: 'Axis', sku: 'P1448-LE', unit: 'EA', qty: bulletCameras, unitCost: 895.00, laborHrs: 1.5, notes: 'Exterior' },
      { system: 'CCTV', category: 'Camera', description: 'PTZ Camera, 4MP, 30x', manufacturer: 'Axis', sku: 'Q6135-LE', unit: 'EA', qty: ptzCameras, unitCost: 3450.00, laborHrs: 2.5, notes: 'Large areas' },
      { system: 'CCTV', category: 'NVR', description: 'Network Video Recorder, 64-Ch', manufacturer: 'Milestone', sku: 'XPCODL-BASE', unit: 'EA', qty: Math.ceil(totalCameras / 64) || 1, unitCost: 4500.00, laborHrs: 4.0, notes: 'Central recording' },
      { system: 'CCTV', category: 'Storage', description: '16TB Surveillance HDD', manufacturer: 'Seagate', sku: 'ST16000VE000', unit: 'EA', qty: Math.ceil(totalCameras / 8), unitCost: 385.00, laborHrs: 0.25, notes: '30-day @ 15fps' },
      { system: 'CCTV', category: 'Network', description: 'PoE++ Switch, 24-Port', manufacturer: 'Cisco', sku: 'CBS350-24FP', unit: 'EA', qty: Math.ceil(totalCameras / 24), unitCost: 1450.00, laborHrs: 1.0, notes: 'Camera switches' },
      { system: 'CCTV', category: 'Cable', description: 'CAT6 Plenum (CCTV)', manufacturer: 'Belden', sku: '7939A', unit: 'FT', qty: cableSummary['CAT6 (CCTV)']?.totalFt || 0, unitCost: 0.35, laborHrs: 0.008, notes: 'Camera runs' },
      { system: 'CCTV', category: 'Cable', description: 'CAT6 Outdoor Direct Burial', manufacturer: 'Belden', sku: '7939A-DB', unit: 'FT', qty: Math.ceil(bulletCameras * 150), unitCost: 0.65, laborHrs: 0.012, notes: 'Exterior cameras' },
      { system: 'CCTV', category: 'Mount', description: 'Camera Wall Mount Bracket', manufacturer: 'Axis', sku: 'T91G61', unit: 'EA', qty: bulletCameras, unitCost: 85.00, laborHrs: 0.25, notes: 'Bullet cameras' },
      { system: 'CCTV', category: 'Mount', description: 'Camera Pendant Mount', manufacturer: 'Axis', sku: 'T94A01L', unit: 'EA', qty: ptzCameras, unitCost: 145.00, laborHrs: 0.5, notes: 'PTZ cameras' },

      // === FIRE ALARM ===
      { system: 'FIRE', category: 'Detector', description: 'Photoelectric Smoke Detector', manufacturer: 'Notifier', sku: 'FSP-851', unit: 'EA', qty: smokeDetectors, unitCost: 85.00, laborHrs: 0.35, notes: 'General areas' },
      { system: 'FIRE', category: 'Detector', description: 'Heat Detector, Rate-of-Rise', manufacturer: 'Notifier', sku: 'FST-851', unit: 'EA', qty: heatDetectors, unitCost: 95.00, laborHrs: 0.35, notes: 'Kitchen/mech' },
      { system: 'FIRE', category: 'Detector', description: 'Duct Detector w/ Housing', manufacturer: 'Notifier', sku: 'DNR-2', unit: 'EA', qty: Math.ceil(smokeDetectors * 0.1), unitCost: 245.00, laborHrs: 1.0, notes: 'HVAC ducts' },
      { system: 'FIRE', category: 'Pull Station', description: 'Manual Pull Station', manufacturer: 'Notifier', sku: 'NBG-12LX', unit: 'EA', qty: pullStations, unitCost: 125.00, laborHrs: 0.5, notes: 'At exits' },
      { system: 'FIRE', category: 'NAC', description: 'Horn/Strobe, Wall, Red', manufacturer: 'Notifier', sku: 'P2RK', unit: 'EA', qty: hornStrobes, unitCost: 145.00, laborHrs: 0.5, notes: 'General notification' },
      { system: 'FIRE', category: 'NAC', description: 'Horn/Strobe, Ceiling, Red', manufacturer: 'Notifier', sku: 'PC2RK', unit: 'EA', qty: Math.ceil(hornStrobes * 0.3), unitCost: 165.00, laborHrs: 0.5, notes: 'Open areas' },
      { system: 'FIRE', category: 'NAC', description: 'Strobe Only, Wall, Red', manufacturer: 'Notifier', sku: 'P2R', unit: 'EA', qty: Math.ceil(hornStrobes * 0.15), unitCost: 125.00, laborHrs: 0.35, notes: 'High noise areas' },
      { system: 'FIRE', category: 'Panel', description: 'Fire Alarm Control Panel', manufacturer: 'Notifier', sku: 'NFS2-3030', unit: 'EA', qty: 1, unitCost: 8500.00, laborHrs: 16.0, notes: 'Addressable' },
      { system: 'FIRE', category: 'Annunciator', description: 'Remote Annunciator', manufacturer: 'Notifier', sku: 'FDU-80', unit: 'EA', qty: 2, unitCost: 1250.00, laborHrs: 2.0, notes: 'Lobby, security' },
      { system: 'FIRE', category: 'Base', description: 'Detector Base Standard', manufacturer: 'Notifier', sku: 'B501', unit: 'EA', qty: smokeDetectors + heatDetectors, unitCost: 18.00, laborHrs: 0.1, notes: '1 per detector' },
      { system: 'FIRE', category: 'Back Box', description: 'Back Box 4" Square', manufacturer: 'Raco', sku: '52151', unit: 'EA', qty: hornStrobes + pullStations, unitCost: 4.50, laborHrs: 0.15, notes: 'NAC devices' },
      { system: 'FIRE', category: 'Cable', description: '18/2 FPLP Shielded', manufacturer: 'West Penn', sku: '60982B', unit: 'FT', qty: cableSummary['18/2 FPLP']?.totalFt || 0, unitCost: 0.38, laborHrs: 0.008, notes: 'SLC circuit' },
      { system: 'FIRE', category: 'Cable', description: '14/2 FPLP', manufacturer: 'West Penn', sku: '60142B', unit: 'FT', qty: cableSummary['14/2 FPLP']?.totalFt || 0, unitCost: 0.42, laborHrs: 0.008, notes: 'NAC circuit' }
    ].filter(item => item.qty > 0); // Only include items with quantities
  };

  // Calculate Master BOM totals for material and labor
  const getMasterBomTotals = () => {
    const items = getDynamicBomItems();
    return items.reduce((acc, item) => ({
      materialCost: acc.materialCost + (item.qty * item.unitCost),
      laborHours: acc.laborHours + (item.qty * item.laborHrs),
      itemCount: acc.itemCount + 1
    }), { materialCost: 0, laborHours: 0, itemCount: 0 });
  };

  // Industry standard labor distribution percentages for LV projects
  // Based on typical project staffing models
  const LABOR_DISTRIBUTION = {
    technician: 0.60,     // 60% - Hands-on installation work
    leadTech: 0.20,       // 20% - Supervision + complex work
    projectManager: 0.10, // 10% - Planning, coordination, closeout
    apprentice: 0.10      // 10% - Assistance, material handling
  };

  // Calculate labor breakdown by position
  const calculateLaborByPosition = (totalHours) => {
    const rates = projectSettings?.laborRates || {
      technician: 65,
      leadTech: 85,
      projectManager: 95,
      apprentice: 45
    };

    const technicianHours = totalHours * LABOR_DISTRIBUTION.technician;
    const leadTechHours = totalHours * LABOR_DISTRIBUTION.leadTech;
    const pmHours = totalHours * LABOR_DISTRIBUTION.projectManager;
    const apprenticeHours = totalHours * LABOR_DISTRIBUTION.apprentice;

    return {
      technician: {
        hours: technicianHours,
        rate: rates.technician,
        cost: technicianHours * rates.technician,
        percentage: LABOR_DISTRIBUTION.technician * 100
      },
      leadTech: {
        hours: leadTechHours,
        rate: rates.leadTech,
        cost: leadTechHours * rates.leadTech,
        percentage: LABOR_DISTRIBUTION.leadTech * 100
      },
      projectManager: {
        hours: pmHours,
        rate: rates.projectManager,
        cost: pmHours * rates.projectManager,
        percentage: LABOR_DISTRIBUTION.projectManager * 100
      },
      apprentice: {
        hours: apprenticeHours,
        rate: rates.apprentice,
        cost: apprenticeHours * rates.apprentice,
        percentage: LABOR_DISTRIBUTION.apprentice * 100
      },
      totalHours: totalHours,
      totalCost: (technicianHours * rates.technician) +
        (leadTechHours * rates.leadTech) +
        (pmHours * rates.projectManager) +
        (apprenticeHours * rates.apprentice),
      blendedRate: totalHours > 0 ?
        ((technicianHours * rates.technician) +
          (leadTechHours * rates.leadTech) +
          (pmHours * rates.projectManager) +
          (apprenticeHours * rates.apprentice)) / totalHours : 0
    };
  };

  // Export BOM for vendor pricing (no prices, just material list)
  const exportForPricing = () => {
    const items = getDynamicBomItems();
    const headers = ['System', 'Category', 'Description', 'Manufacturer', 'SKU', 'Unit', 'Qty'];
    const csv = [
      headers.join(','),
      ...items.map(item => [
        `"${item.system}"`,
        `"${item.category}"`,
        `"${item.description}"`,
        `"${item.manufacturer}"`,
        `"${item.sku}"`,
        `"${item.unit}"`,
        item.qty
      ].join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `BOM_For_Pricing_${projectName || 'Project'}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Export full proposal with pricing and labor breakdown by system and position
  const exportProposal = () => {
    const items = getDynamicBomItems();
    const totals = getMasterBomTotals();
    const laborBreakdown = calculateLaborByPosition(totals.laborHours);

    // Group items by system
    const systemGroups = {
      'CABLING': { items: [], material: 0, laborHours: 0 },
      'ACCESS': { items: [], material: 0, laborHours: 0 },
      'CCTV': { items: [], material: 0, laborHours: 0 },
      'FIRE': { items: [], material: 0, laborHours: 0 }
    };

    // Populate groups with items
    items.forEach(item => {
      const systemKey = item.system;
      if (systemGroups[systemKey]) {
        systemGroups[systemKey].items.push(item);
        systemGroups[systemKey].material += item.qty * item.unitCost;
        systemGroups[systemKey].laborHours += item.qty * item.laborHrs;
      }
    });

    // System display names
    const systemNames = {
      'CABLING': 'Structured Cabling',
      'ACCESS': 'Access Control',
      'CCTV': 'CCTV / Security',
      'FIRE': 'Fire Alarm'
    };

    // Build CSV content with system-by-system breakdown
    let csvContent = [];
    const headers = ['System', 'Category', 'Description', 'Manufacturer', 'SKU', 'Unit', 'Qty', 'Unit Cost', 'Ext Cost', 'Labor Hrs'];

    // Project header
    csvContent.push(`PROJECT PROPOSAL: ${projectName || 'Untitled Project'}`);
    csvContent.push(`Generated: ${new Date().toLocaleDateString()}`);
    csvContent.push('');

    // Track system totals for summary
    const systemTotals = [];

    // Generate section for each active system
    Object.entries(systemGroups).forEach(([systemKey, data]) => {
      if (data.items.length === 0) return; // Skip empty systems

      const systemLaborBreakdown = calculateLaborByPosition(data.laborHours);
      const systemTotal = data.material + systemLaborBreakdown.totalCost;

      systemTotals.push({
        name: systemNames[systemKey],
        material: data.material,
        laborHours: data.laborHours,
        laborCost: systemLaborBreakdown.totalCost,
        total: systemTotal
      });

      // System header
      csvContent.push('═'.repeat(80));
      csvContent.push(`${systemNames[systemKey]} - Bill of Materials`);
      csvContent.push('═'.repeat(80));
      csvContent.push('');
      csvContent.push(headers.join(','));

      // System items
      data.items.forEach(item => {
        csvContent.push([
          `"${item.system}"`,
          `"${item.category}"`,
          `"${item.description}"`,
          `"${item.manufacturer}"`,
          `"${item.sku}"`,
          `"${item.unit}"`,
          item.qty,
          item.unitCost.toFixed(2),
          (item.qty * item.unitCost).toFixed(2),
          (item.qty * item.laborHrs).toFixed(2)
        ].join(','));
      });

      // System subtotals
      csvContent.push('');
      csvContent.push(`${systemNames[systemKey]} SUBTOTALS`);
      csvContent.push(`Material Cost,$${data.material.toFixed(2)}`);
      csvContent.push(`Labor Hours,${data.laborHours.toFixed(1)}`);
      csvContent.push('');
      csvContent.push(`${systemNames[systemKey]} Labor by Position:`);
      csvContent.push(`  Technician (60%),${systemLaborBreakdown.technician.hours.toFixed(1)} hrs,$${systemLaborBreakdown.technician.cost.toFixed(2)}`);
      csvContent.push(`  Lead Technician (20%),${systemLaborBreakdown.leadTech.hours.toFixed(1)} hrs,$${systemLaborBreakdown.leadTech.cost.toFixed(2)}`);
      csvContent.push(`  Project Manager (10%),${systemLaborBreakdown.projectManager.hours.toFixed(1)} hrs,$${systemLaborBreakdown.projectManager.cost.toFixed(2)}`);
      csvContent.push(`  Apprentice (10%),${systemLaborBreakdown.apprentice.hours.toFixed(1)} hrs,$${systemLaborBreakdown.apprentice.cost.toFixed(2)}`);
      csvContent.push(`Labor Cost,$${systemLaborBreakdown.totalCost.toFixed(2)}`);
      csvContent.push(`${systemNames[systemKey]} TOTAL,$${systemTotal.toFixed(2)}`);
      csvContent.push('');
      csvContent.push('');
    });

    // Project Summary
    csvContent.push('═'.repeat(80));
    csvContent.push('PROJECT SUMMARY');
    csvContent.push('═'.repeat(80));
    csvContent.push('');
    csvContent.push('SYSTEM BREAKDOWN');
    csvContent.push('System,Material,Labor Hours,Labor Cost,System Total');

    systemTotals.forEach(sys => {
      csvContent.push(`${sys.name},$${sys.material.toFixed(2)},${sys.laborHours.toFixed(1)},$${sys.laborCost.toFixed(2)},$${sys.total.toFixed(2)}`);
    });

    csvContent.push('');
    csvContent.push('COMBINED LABOR BREAKDOWN BY POSITION');
    csvContent.push('Position,Hours,Rate ($/hr),Cost,% of Total');
    csvContent.push(`Technician (60%),${laborBreakdown.technician.hours.toFixed(1)},$${laborBreakdown.technician.rate},$${laborBreakdown.technician.cost.toFixed(2)},${laborBreakdown.technician.percentage}%`);
    csvContent.push(`Lead Technician (20%),${laborBreakdown.leadTech.hours.toFixed(1)},$${laborBreakdown.leadTech.rate},$${laborBreakdown.leadTech.cost.toFixed(2)},${laborBreakdown.leadTech.percentage}%`);
    csvContent.push(`Project Manager (10%),${laborBreakdown.projectManager.hours.toFixed(1)},$${laborBreakdown.projectManager.rate},$${laborBreakdown.projectManager.cost.toFixed(2)},${laborBreakdown.projectManager.percentage}%`);
    csvContent.push(`Apprentice (10%),${laborBreakdown.apprentice.hours.toFixed(1)},$${laborBreakdown.apprentice.rate},$${laborBreakdown.apprentice.cost.toFixed(2)},${laborBreakdown.apprentice.percentage}%`);
    csvContent.push('');
    csvContent.push('GRAND TOTALS');
    csvContent.push(`Total Material,$${totals.materialCost.toFixed(2)}`);
    csvContent.push(`Total Labor Hours,${laborBreakdown.totalHours.toFixed(1)}`);
    csvContent.push(`Total Labor Cost,$${laborBreakdown.totalCost.toFixed(2)}`);
    csvContent.push(`Blended Labor Rate,$${laborBreakdown.blendedRate.toFixed(2)}/hr`);
    csvContent.push('');
    csvContent.push(`═══ GRAND TOTAL: $${(totals.materialCost + laborBreakdown.totalCost).toFixed(2)} ═══`);

    const csv = csvContent.join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Proposal_${projectName || 'Project'}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };


  const analyzeFloorPlanForMarking = async (file) => {
    if (!file) return [];

    setProcessingStatus('🔍 AI scanning floor plan for devices...');

    try {
      console.log('[App] Starting AI analysis for visual marking:', file.name);
      const result = await analyzeFloorPlan(file);

      if (result?.devices && Array.isArray(result.devices)) {
        console.log('[App] AI detected', result.devices.length, 'devices with coordinates');

        // Convert percentage coordinates to pixels for 600x400 preview
        const scaledDevices = result.devices.map((device, idx) => ({
          ...device,
          id: device.id || idx + 1,
          x: (device.x / 100) * 600,
          y: (device.y / 100) * 400,
          confidence: device.confidence || 0.85
        }));

        setDetectedDevices(scaledDevices);
        return scaledDevices;
      }

      return [];
    } catch (error) {
      console.error('[App] AI analysis failed:', error);
      setProcessingStatus('⚠️ AI analysis failed - using demo markers');
      return [];
    }
  };

  // Process documents with AI Multi-Pass Analysis
  const processDocuments = async () => {
    setIsProcessing(true);
    setCurrentStep(2);

    try {
      // If AI analysis is enabled and we have files, use real analysis
      if (useAiAnalysis && planFiles.length > 0) {
        // Stage 1: Specification Parsing (if specs provided)
        let specResults = null;
        if (specFiles.length > 0) {
          setProcessingStatus('📄 Parsing specifications (Div 27/28)...');
          setProcessingProgress(10);
          try {
            specResults = await parseSpecification(specFiles[0]);
            console.log('[AI] Spec parsing complete:', specResults?.deviceSchedules?.length || 0, 'device schedules');
          } catch (err) {
            console.warn('[AI] Spec parsing failed:', err.message);
          }
        }

        // Stage 2: Multi-Pass Floor Plan Analysis
        setProcessingStatus('🔍 Pass 1: Extracting legend symbols...');
        setProcessingProgress(20);

        const aiResults = await analyzeAllSheets(planFiles, (progress) => {
          const pct = 20 + (progress.current / progress.total) * 60;
          setProcessingProgress(pct);
          if (progress.current <= planFiles.length * 0.33) {
            setProcessingStatus(`🔍 Pass 1: Extracting legends (${progress.current}/${progress.total})...`);
          } else if (progress.current <= planFiles.length * 0.66) {
            setProcessingStatus(`📊 Pass 2: Grid-based counting (${progress.current}/${progress.total})...`);
          } else {
            setProcessingStatus(`✅ Pass 3: Validating counts (${progress.current}/${progress.total})...`);
          }
        });

        // Stage 3: Cross-reference spec vs plans (if both available)
        setProcessingStatus('🔗 Cross-referencing specs with plans...');
        setProcessingProgress(85);

        let crossRefResults = null;
        if (specResults && aiResults.totalsBySystem) {
          crossRefResults = crossReferenceSpecVsPlan(specResults, aiResults.totalsBySystem);
          console.log('[AI] Cross-reference:', crossRefResults?.discrepancies?.length || 0, 'discrepancies found');
        }

        // Stage 4: Build final results
        setProcessingStatus('📋 Generating Master BOM...');
        setProcessingProgress(95);

        const deviceCounts = convertToDeviceCounts(aiResults);
        const finalResults = buildResultsFromAI(aiResults, deviceCounts);

        // Add cross-reference issues if any
        if (crossRefResults?.discrepancies?.length > 0) {
          finalResults.issues = [
            ...finalResults.issues,
            ...crossRefResults.discrepancies.map((d, i) => ({
              id: 100 + i,
              severity: d.severity,
              category: 'SPEC_VS_PLAN',
              description: `${d.type}: Spec shows ${d.specQty}, plans show ${d.planQty} (${d.difference > 0 ? '+' : ''}${d.difference})`,
              impact: d.recommendation,
              sheetRef: '',
              specRef: d.section,
              needsRfi: d.severity === 'HIGH'
            }))
          ];
        }

        // Store detected devices for visual verification
        if (aiResults.sheets?.[0]?.devices) {
          setDetectedDevices(aiResults.sheets[0].devices.map((d, idx) => ({
            ...d,
            id: d.id || idx + 1,
            x: d.x || 50,
            y: d.y || 50,
            confidence: d.confidence || 0.85
          })));
        }

        setProcessingStatus('✅ AI Analysis Complete!');
        setProcessingProgress(100);
        setResults(finalResults);
        setIsProcessing(false);
        setCurrentStep(3);
        return;
      }

      // No AI analysis was performed - user must enable AI and upload floor plans
      setProcessingStatus('❌ No floor plans analyzed. Enable AI Analysis and upload floor plans to generate device counts.');
      setIsProcessing(false);
    } catch (error) {
      console.error('[AI] Processing error:', error);
      setProcessingStatus(`❌ Error: ${error.message}`);
      setIsProcessing(false);
    }
  };

  // Build results object from AI analysis
  const buildResultsFromAI = (aiResults, deviceCounts) => {
    // Restructure device counts for display
    const formattedDeviceCounts = {
      'DATACOM': {},
      'SECURITY': {},
      'ACCESS CONTROL': {},
      'A/V': {}
    };

    const systemMapping = {
      datacom: 'DATACOM',
      security: 'SECURITY',
      accessControl: 'ACCESS CONTROL',
      av: 'A/V'
    };

    for (const [system, devices] of Object.entries(deviceCounts)) {
      const targetSystem = systemMapping[system] || system.toUpperCase();
      for (const [key, device] of Object.entries(devices)) {
        formattedDeviceCounts[targetSystem][device.name] = {
          qty: device.qty,
          byFloor: { 'All Floors': device.qty }
        };
      }
    }

    return {
      project: projectName || 'Untitled Project',
      processedAt: new Date().toISOString(),
      aiAnalysis: aiResults, // Store raw AI results

      sheets: aiResults.sheets.map((sheet, i) => ({
        id: `sheet-${i}`,
        name: sheet.fileName || `Sheet ${i + 1}`,
        floor: sheet.sheetName || 'Unknown',
        discipline: 'Technology',
        deviceCount: sheet.devices?.reduce((sum, d) => sum + d.qty, 0) || 0,
        confidence: 0.9
      })),

      deviceCounts: formattedDeviceCounts,

      cableSummary: estimateCabling(aiResults),

      closets: aiResults.closets || generateClosetsFromDevices(aiResults),

      issues: aiResults.issues.map((issue, i) => ({
        id: i + 1,
        severity: issue.severity || 'MEDIUM',
        category: 'AI_ANALYSIS',
        description: issue.message || issue,
        impact: 'Review recommended',
        sheetRef: issue.sheet || '',
        needsRfi: true
      })),

      assumptions: [
        { id: 'A1', category: 'AI_ANALYSIS', description: 'Device counts from Gemini Vision AI analysis', confidence: 'AI', impact: '±5%' },
        { id: 'A2', category: 'CABLE', description: 'Cable lengths estimated at 100ft average per drop', confidence: 'DEFAULT', impact: '±15%' },
        { id: 'A3', category: 'WASTE', description: '5% cable waste factor applied', confidence: 'INDUSTRY', impact: '±2%' }
      ],

      masterBom: generateBomFromAI(aiResults),

      jHookCount: Math.round(Object.values(aiResults.aggregatedDevices).reduce((sum, d) => sum + d.totalQty, 0) * 12),
      totalCableFt: Object.values(aiResults.aggregatedDevices).reduce((sum, d) => sum + d.totalQty, 0) * 100,
      serviceLoopFt: Object.values(aiResults.aggregatedDevices).reduce((sum, d) => sum + d.totalQty, 0) * 10
    };
  };

  // Estimate cabling from device counts
  const estimateCabling = (aiResults) => {
    const totalDevices = Object.values(aiResults.aggregatedDevices).reduce((sum, d) => sum + d.totalQty, 0);
    return {
      'CAT6A Plenum': { system: 'DATACOM', totalFt: totalDevices * 100, boxes: Math.ceil(totalDevices * 100 / 1000), waste: 1.05 },
      'Coax RG-6': { system: 'A/V', totalFt: totalDevices * 30, boxes: Math.ceil(totalDevices * 30 / 1000), waste: 1.05 }
    };
  };

  // Generate BOM items from AI results
  const generateBomFromAI = (aiResults) => {
    const bomItems = [];

    for (const [deviceName, data] of Object.entries(aiResults.aggregatedDevices)) {
      bomItems.push({
        system: 'DATACOM',
        category: 'Device',
        description: deviceName,
        manufacturer: 'TBD',
        sku: 'TBD',
        unit: 'EA',
        qty: data.totalQty,
        notes: `AI counted from ${data.bySheet.length} sheet(s)`
      });
    }

    return bomItems;
  };

  // Generate closet summary from AI device counts - calculates cable runs based on actual devices
  const generateClosetsFromDevices = (aiResults) => {
    const totalDevices = Object.values(aiResults.aggregatedDevices || {}).reduce((sum, d) => sum + d.totalQty, 0);

    // If no devices, return empty closets
    if (totalDevices === 0) {
      return [];
    }

    // Calculate cable runs = 1 cable per device (not multiplied)
    // Each device gets exactly 1 cable run
    const avgCableFtPerDevice = 100; // Industry standard estimate

    // Generate MDF with all devices (single closet model for simple projects)
    return [{
      name: 'MDF',
      type: 'MDF',
      floor: 'Level 1',
      room: 'Main Telecom Room',
      dataPorts: totalDevices,
      voicePorts: 0,
      fiberPorts: 0,
      cableRuns: totalDevices, // 1:1 ratio - each device = 1 cable run
      totalCableFt: totalDevices * avgCableFtPerDevice
    }];
  };

  // NOTE: generateMockResults below is DEPRECATED and not called anymore
  // Real AI analysis is now required - no demo/mock data fallback
  const generateMockResults = () => {
    const floors = ['Level 1', 'Level 2', 'Level 3'];
    const closets = ['MDF', 'IDF-1', 'IDF-2', 'IDF-3'];

    return {
      project: projectName || 'Untitled Project',
      processedAt: new Date().toISOString(),
      sheets: planFiles.map((f, i) => ({
        id: `sheet-${i}`,
        name: f.name,
        floor: floors[i % floors.length],
        discipline: ['Telecom', 'Security', 'Fire Alarm'][i % 3],
        deviceCount: Math.floor(Math.random() * 50) + 20,
        confidence: 0.85 + Math.random() * 0.12
      })),

      deviceCounts: {
        'CABLING': {
          'Data Outlet': { qty: 248, byFloor: { 'Level 1': 96, 'Level 2': 84, 'Level 3': 68 } },
          'Voice Outlet': { qty: 86, byFloor: { 'Level 1': 32, 'Level 2': 30, 'Level 3': 24 } },
          'WAP': { qty: 32, byFloor: { 'Level 1': 12, 'Level 2': 12, 'Level 3': 8 } },
          'Fiber Outlet': { qty: 12, byFloor: { 'Level 1': 4, 'Level 2': 4, 'Level 3': 4 } }
        },
        'ACCESS': {
          'Card Reader': { qty: 32, byFloor: { 'Level 1': 14, 'Level 2': 10, 'Level 3': 8 } },
          'REX Sensor': { qty: 32, byFloor: { 'Level 1': 14, 'Level 2': 10, 'Level 3': 8 } },
          'Door Contact': { qty: 32, byFloor: { 'Level 1': 14, 'Level 2': 10, 'Level 3': 8 } },
          'Electric Strike': { qty: 20, byFloor: { 'Level 1': 8, 'Level 2': 7, 'Level 3': 5 } },
          'Mag Lock': { qty: 12, byFloor: { 'Level 1': 6, 'Level 2': 3, 'Level 3': 3 } }
        },
        'CCTV': {
          'Dome Camera': { qty: 28, byFloor: { 'Level 1': 12, 'Level 2': 10, 'Level 3': 6 } },
          'Bullet Camera': { qty: 16, byFloor: { 'Level 1': 8, 'Level 2': 4, 'Level 3': 4 } },
          'PTZ Camera': { qty: 4, byFloor: { 'Level 1': 2, 'Level 2': 1, 'Level 3': 1 } }
        },
        'FIRE': {
          'Smoke Detector': { qty: 86, byFloor: { 'Level 1': 32, 'Level 2': 30, 'Level 3': 24 } },
          'Heat Detector': { qty: 12, byFloor: { 'Level 1': 6, 'Level 2': 4, 'Level 3': 2 } },
          'Pull Station': { qty: 16, byFloor: { 'Level 1': 6, 'Level 2': 6, 'Level 3': 4 } },
          'Horn/Strobe': { qty: 60, byFloor: { 'Level 1': 24, 'Level 2': 20, 'Level 3': 16 } }
        }
      },

      cableSummary: {
        'CAT6A Plenum': { system: 'CABLING', totalFt: 45250, boxes: 46, waste: 1.05 },
        'CAT6A (Voice)': { system: 'CABLING', totalFt: 12500, boxes: 13, waste: 1.05 },
        'OM4 Fiber': { system: 'CABLING', totalFt: 1200, boxes: 2, waste: 1.05 },
        '18/4 Shielded': { system: 'ACCESS', totalFt: 4800, boxes: 5, waste: 1.05 },
        '22/6 Shielded': { system: 'ACCESS', totalFt: 3200, boxes: 4, waste: 1.05 },
        'CAT6 (CCTV)': { system: 'CCTV', totalFt: 12600, boxes: 13, waste: 1.05 },
        '18/2 FPLP': { system: 'FIRE', totalFt: 8400, boxes: 9, waste: 1.05 },
        '14/2 FPLP': { system: 'FIRE', totalFt: 4200, boxes: 5, waste: 1.05 }
      },

      closets: [
        { name: 'MDF', type: 'MDF', floor: 'Level 1', room: 'Room 101 - Main Telecom', dataPorts: 96, voicePorts: 48, fiberPorts: 24, cableRuns: 186, totalCableFt: 22500 },
        { name: 'IDF-1', type: 'IDF', floor: 'Level 1', room: 'Room 108 - East Wing', dataPorts: 48, voicePorts: 24, fiberPorts: 6, cableRuns: 82, totalCableFt: 9800 },
        { name: 'IDF-2', type: 'IDF', floor: 'Level 2', room: 'Room 201 - Telecom Closet', dataPorts: 52, voicePorts: 22, fiberPorts: 6, cableRuns: 78, totalCableFt: 11200 },
        { name: 'IDF-3', type: 'IDF', floor: 'Level 3', room: 'Room 301 - Telecom Closet', dataPorts: 44, voicePorts: 18, fiberPorts: 6, cableRuns: 64, totalCableFt: 8700 },
        { name: 'FACP', type: 'FACP', floor: 'Level 1', room: 'Room 102 - Electrical', dataPorts: 0, voicePorts: 0, fiberPorts: 0, cableRuns: 174, totalCableFt: 12600 },
        { name: 'Security Head-End', type: 'SEC', floor: 'Level 1', room: 'Room 101 - Main Telecom', dataPorts: 12, voicePorts: 0, fiberPorts: 0, cableRuns: 96, totalCableFt: 8400 }
      ],

      // Unit Types from T4.02 Room Breakouts (multiplied by count on T2.02)
      unitTypes: [
        { type: 'A1.1', description: '1-Bedroom Unit', sheet: 'T4.02', count: 12, devicesPerUnit: { 'Data Outlet': 3, 'Coax Outlet': 2, 'Home Network Panel': 1 }, totalDevices: 72 },
        { type: 'A1.2', description: '1-Bedroom + Den', sheet: 'T4.02', count: 8, devicesPerUnit: { 'Data Outlet': 4, 'Coax Outlet': 2, 'Home Network Panel': 1 }, totalDevices: 56 },
        { type: 'B2.1', description: '2-Bedroom Unit', sheet: 'T4.02', count: 16, devicesPerUnit: { 'Data Outlet': 5, 'Coax Outlet': 3, 'Home Network Panel': 1 }, totalDevices: 144 },
        { type: 'C1.1', description: 'Studio Unit', sheet: 'T4.02', count: 6, devicesPerUnit: { 'Data Outlet': 2, 'Coax Outlet': 1, 'Home Network Panel': 1 }, totalDevices: 24 },
        { type: 'S1.1', description: 'Penthouse Suite', sheet: 'T4.02', count: 2, devicesPerUnit: { 'Data Outlet': 8, 'Coax Outlet': 4, 'Home Network Panel': 1, 'WAP': 2 }, totalDevices: 30 }
      ],


      issues: [
        { id: 1, severity: 'CRITICAL', category: 'MISSING', description: 'No MDF location identified on Level 1 plans', impact: 'Cannot determine backbone termination point', sheetRef: 'T-101', specRef: '27 10 00', needsRfi: true },
        { id: 2, severity: 'HIGH', category: 'CONFLICT', description: 'Plans show CAT6 but spec requires CAT6A Plenum', impact: 'Material cost difference ~15%', sheetRef: 'T-101', specRef: '27 15 00', needsRfi: true },
        { id: 3, severity: 'HIGH', category: 'MISSING', description: 'No riser diagram found in drawing set', impact: 'Backbone quantities estimated', sheetRef: 'N/A', specRef: '27 13 00', needsRfi: true },
        { id: 4, severity: 'MEDIUM', category: 'AMBIGUITY', description: 'East wing devices have no homerun indication', impact: 'Assumed nearest IDF; lengths may vary ±10%', sheetRef: 'T-102', specRef: '', needsRfi: true },
        { id: 5, severity: 'MEDIUM', category: 'CONFLICT', description: 'Symbol count (248) differs from schedule (256)', impact: '8 outlets difference', sheetRef: 'T-001', specRef: '', needsRfi: false },
        { id: 6, severity: 'LOW', category: 'AMBIGUITY', description: 'Multiple approved manufacturers listed', impact: 'Priced mid-range; may vary ±10%', sheetRef: '', specRef: '28 13 00', needsRfi: false }
      ],

      assumptions: [
        { id: 'A1', category: 'SCALE', description: 'Drawing scale 1/8" = 1\'-0" per title block', confidence: 'HIGH', impact: '±3%' },
        { id: 'A2', category: 'PATHWAY', description: 'J-hooks every 8\' per spec 27 05 00', confidence: 'SPEC', impact: '±2%' },
        { id: 'A3', category: 'SERVICE_LOOP', description: '10\' service loop per cable run', confidence: 'DEFAULT', impact: '±5%' },
        { id: 'A4', category: 'WASTE', description: '5% cable waste factor applied', confidence: 'INDUSTRY', impact: '±2%' },
        { id: 'A5', category: 'ROUTING', description: '90° corridor-first cable routing', confidence: 'DEFAULT', impact: '±8%' }
      ],

      masterBom: generateBomItems(),

      jHookCount: 5656,
      totalCableFt: 92150,
      serviceLoopFt: 3780
    };
  };

  const generateBomItems = () => [
    // === CABLING / STRUCTURED ===
    // Horizontal Cable
    { system: 'CABLING', category: 'Horizontal Cable', description: 'CAT6A Plenum Cable, Blue', manufacturer: 'Belden', sku: '10GXS12', unit: 'FT', qty: 45250, notes: 'Per spec 27 15 00; +5% waste' },
    { system: 'CABLING', category: 'Horizontal Cable', description: 'CAT6A Plenum Cable, White (Voice)', manufacturer: 'Belden', sku: '10GXS12-WHT', unit: 'FT', qty: 12500, notes: 'Voice runs; +5% waste' },
    { system: 'CABLING', category: 'Backbone Cable', description: 'OM4 50/125 Fiber, 12-strand', manufacturer: 'Corning', sku: '012T88-33131', unit: 'FT', qty: 1200, notes: 'MDF to IDF risers' },
    // Outlets & Jacks
    { system: 'CABLING', category: 'Outlet', description: 'Data Outlet - CAT6A Jack, Blue', manufacturer: 'Panduit', sku: 'CJ6X88TGBU', unit: 'EA', qty: 248, notes: 'Per plan count' },
    { system: 'CABLING', category: 'Outlet', description: 'Voice Outlet - CAT6A Jack, White', manufacturer: 'Panduit', sku: 'CJ6X88TGWH', unit: 'EA', qty: 86, notes: 'Per plan count' },
    { system: 'CABLING', category: 'Faceplate', description: 'Faceplate - 2-Port, White', manufacturer: 'Panduit', sku: 'CFPE2WHY', unit: 'EA', qty: 144, notes: 'Data/voice combo' },
    { system: 'CABLING', category: 'Faceplate', description: 'Faceplate - 1-Port, White', manufacturer: 'Panduit', sku: 'CFPE1WHY', unit: 'EA', qty: 48, notes: 'Single jack locations' },
    { system: 'CABLING', category: 'Surface Box', description: 'Surface Mount Box 2-Port', manufacturer: 'Panduit', sku: 'CBX2WH-A', unit: 'EA', qty: 24, notes: 'Exposed locations' },
    // WAP
    { system: 'CABLING', category: 'WAP', description: 'Wireless Access Point', manufacturer: 'Cisco', sku: 'C9120AXI-B', unit: 'EA', qty: 32, notes: 'Per plan count' },
    { system: 'CABLING', category: 'WAP Mount', description: 'WAP Mounting Bracket', manufacturer: 'Cisco', sku: 'AIR-AP-BRACKET-1', unit: 'EA', qty: 32, notes: '1 per WAP' },
    { system: 'CABLING', category: 'WAP Cable', description: 'CAT6A Plenum Cable (WAP Drops)', manufacturer: 'Belden', sku: '10GXS12', unit: 'FT', qty: 3200, notes: '**ALWAYS CAT6A** - company standard' },
    // Patch Panels & Racks
    { system: 'CABLING', category: 'Patch Panel', description: '48-Port CAT6A Patch Panel', manufacturer: 'Panduit', sku: 'CP48BLY', unit: 'EA', qty: 8, notes: 'Per closet counts' },
    { system: 'CABLING', category: 'Patch Panel', description: '24-Port CAT6A Patch Panel', manufacturer: 'Panduit', sku: 'CP24BLY', unit: 'EA', qty: 4, notes: 'Smaller IDFs' },
    { system: 'CABLING', category: 'Rack', description: '42U 4-Post Rack', manufacturer: 'Chatsworth', sku: '57089-703', unit: 'EA', qty: 2, notes: 'MDF location' },
    { system: 'CABLING', category: 'Rack', description: '2-Post Relay Rack 7ft', manufacturer: 'Chatsworth', sku: '11307-712', unit: 'EA', qty: 3, notes: 'IDF locations' },
    { system: 'CABLING', category: 'Cable Manager', description: 'Vertical Cable Manager', manufacturer: 'Panduit', sku: 'WMPVF45E', unit: 'EA', qty: 10, notes: '4 MDF + 2 per IDF' },
    { system: 'CABLING', category: 'Cable Manager', description: 'Horizontal Cable Manager 2U', manufacturer: 'Panduit', sku: 'WMPF2E', unit: 'EA', qty: 20, notes: 'Between panels' },
    // Patch Cords
    { system: 'CABLING', category: 'Patch Cord', description: 'CAT6A Patch Cord 3ft Blue', manufacturer: 'Panduit', sku: 'UTP6AX3BU', unit: 'EA', qty: 200, notes: 'Equipment side' },
    { system: 'CABLING', category: 'Patch Cord', description: 'CAT6A Patch Cord 7ft Blue', manufacturer: 'Panduit', sku: 'UTP6AX7BU', unit: 'EA', qty: 100, notes: 'Cross-connects' },
    { system: 'CABLING', category: 'Patch Cord', description: 'CAT6A Patch Cord 3ft White', manufacturer: 'Panduit', sku: 'UTP6AX3WH', unit: 'EA', qty: 48, notes: 'Voice circuits' },
    // Fiber
    { system: 'CABLING', category: 'Fiber Enclosure', description: 'Fiber Enclosure 1U Rack Mount', manufacturer: 'Corning', sku: 'CCH-01U', unit: 'EA', qty: 4, notes: '1 MDF + 3 IDF' },
    { system: 'CABLING', category: 'Fiber Panel', description: 'LC Duplex Adapter Panel 6-Pack', manufacturer: 'Corning', sku: 'CCH-CP06-A9', unit: 'EA', qty: 12, notes: 'OM4 connections' },
    { system: 'CABLING', category: 'Fiber Patch Cord', description: 'OM4 LC-LC Duplex Patch Cord 3m', manufacturer: 'Corning', sku: '002318G8120003M', unit: 'EA', qty: 36, notes: 'Backbone connections' },
    { system: 'CABLING', category: 'Fiber Connector', description: 'LC Connector OM4', manufacturer: 'Corning', sku: '95-050-99-X', unit: 'EA', qty: 72, notes: 'Field terminations' },
    // Pathway & Support
    { system: 'CABLING', category: 'Pathway', description: 'J-Hook, 2\" (CAT6A Rated)', manufacturer: 'Erico', sku: 'CAT64HP', unit: 'EA', qty: 5656, notes: '1 every 8\' per run' },
    { system: 'CABLING', category: 'Pathway', description: 'Ladder Rack 12\"', manufacturer: 'B-Line', sku: 'SB1218S12FB', unit: 'FT', qty: 72, notes: 'Closet overhead' },
    { system: 'CABLING', category: 'Pathway', description: 'Basket Tray 12\"', manufacturer: 'Cablofil', sku: 'CM30EZ300', unit: 'FT', qty: 150, notes: 'Corridors' },
    { system: 'CABLING', category: 'Velcro', description: 'Velcro Strap Roll', manufacturer: 'Panduit', sku: 'HLM-15R0', unit: 'ROLL', qty: 24, notes: 'Cable bundling' },
    { system: 'CABLING', category: 'Labels', description: 'Cable Labels (Pre-printed)', manufacturer: 'Brady', sku: 'WML-311-292', unit: 'EA', qty: 800, notes: 'Per TIA-606 standard' },
    // Power & Grounding
    { system: 'CABLING', category: 'Power', description: 'Power Strip 20A', manufacturer: 'Tripp Lite', sku: 'PDUMV20', unit: 'EA', qty: 8, notes: 'Rack PDUs' },
    { system: 'CABLING', category: 'Grounding', description: 'Ground Bar Kit', manufacturer: 'Panduit', sku: 'GB4BCV0512TY', unit: 'EA', qty: 4, notes: 'Per closet' },
    { system: 'CABLING', category: 'UPS', description: 'UPS 3000VA Rack Mount', manufacturer: 'APC', sku: 'SMT3000RM2U', unit: 'EA', qty: 2, notes: 'Critical racks' },
    // Firestopping
    { system: 'CABLING', category: 'Firestop', description: 'Firestop Putty Pad', manufacturer: '3M', sku: 'MPP+', unit: 'EA', qty: 24, notes: 'Penetrations' },
    { system: 'CABLING', category: 'Firestop', description: 'Firestop Caulk', manufacturer: '3M', sku: 'CP-25WB+', unit: 'TUBE', qty: 12, notes: 'Penetrations' },

    // === ACCESS CONTROL ===
    { system: 'ACCESS', category: 'Reader', description: 'Card Reader - Multi-Tech, Mullion', manufacturer: 'HID', sku: '920PTNNEK00000', unit: 'EA', qty: 24, notes: 'Entry side' },
    { system: 'ACCESS', category: 'Reader', description: 'Card Reader - Keypad', manufacturer: 'HID', sku: '921PTNNEK00000', unit: 'EA', qty: 8, notes: 'Secure areas' },
    { system: 'ACCESS', category: 'REX', description: 'Request-to-Exit Sensor', manufacturer: 'Bosch', sku: 'DS150I', unit: 'EA', qty: 32, notes: '1 per door' },
    { system: 'ACCESS', category: 'DPS', description: 'Door Position Switch', manufacturer: 'GE', sku: '1076-N', unit: 'EA', qty: 32, notes: '1 per door' },
    { system: 'ACCESS', category: 'Lock', description: 'Electric Strike, Fail-Secure', manufacturer: 'HES', sku: '9600-12/24-630', unit: 'EA', qty: 20, notes: 'Standard doors' },
    { system: 'ACCESS', category: 'Lock', description: 'Mag Lock, 1200lb', manufacturer: 'Securitron', sku: 'M62', unit: 'EA', qty: 12, notes: 'Glass doors' },
    { system: 'ACCESS', category: 'Panel', description: 'Access Control Panel, 4-Door', manufacturer: 'Mercury', sku: 'MR52', unit: 'EA', qty: 8, notes: '32 doors / 4' },
    { system: 'ACCESS', category: 'Power Supply', description: 'Power Supply 12/24V 6A', manufacturer: 'Altronix', sku: 'AL600ULACM', unit: 'EA', qty: 8, notes: '1 per panel' },
    { system: 'ACCESS', category: 'Cable', description: '18/4 Shielded Plenum', manufacturer: 'West Penn', sku: '25254B', unit: 'FT', qty: 4800, notes: 'Reader cable' },
    { system: 'ACCESS', category: 'Cable', description: '22/6 Shielded Plenum', manufacturer: 'West Penn', sku: '25226B', unit: 'FT', qty: 3200, notes: 'Lock/REX cable' },

    // === CCTV ===
    { system: 'CCTV', category: 'Camera', description: 'IP Dome Camera, 4MP, Indoor', manufacturer: 'Axis', sku: 'P3245-V', unit: 'EA', qty: 28, notes: 'Interior' },
    { system: 'CCTV', category: 'Camera', description: 'IP Bullet Camera, 4MP, Outdoor', manufacturer: 'Axis', sku: 'P1448-LE', unit: 'EA', qty: 16, notes: 'Exterior' },
    { system: 'CCTV', category: 'Camera', description: 'PTZ Camera, 4MP, 30x', manufacturer: 'Axis', sku: 'Q6135-LE', unit: 'EA', qty: 4, notes: 'Large areas' },
    { system: 'CCTV', category: 'NVR', description: 'Network Video Recorder, 64-Ch', manufacturer: 'Milestone', sku: 'XPCODL-BASE', unit: 'EA', qty: 1, notes: 'Central recording' },
    { system: 'CCTV', category: 'Storage', description: '16TB Surveillance HDD', manufacturer: 'Seagate', sku: 'ST16000VE000', unit: 'EA', qty: 8, notes: '30-day @ 15fps' },
    { system: 'CCTV', category: 'Network', description: 'PoE++ Switch, 24-Port', manufacturer: 'Cisco', sku: 'CBS350-24FP', unit: 'EA', qty: 3, notes: 'Camera switches' },
    { system: 'CCTV', category: 'Cable', description: 'CAT6 Outdoor Direct Burial', manufacturer: 'Belden', sku: '7939A', unit: 'FT', qty: 2400, notes: 'Exterior cameras' },
    { system: 'CCTV', category: 'Mount', description: 'Camera Wall Mount Bracket', manufacturer: 'Axis', sku: 'T91G61', unit: 'EA', qty: 16, notes: 'Bullet cameras' },
    { system: 'CCTV', category: 'Mount', description: 'Camera Pendant Mount', manufacturer: 'Axis', sku: 'T94A01L', unit: 'EA', qty: 4, notes: 'PTZ cameras' },

    // === FIRE ALARM ===
    { system: 'FIRE', category: 'Detector', description: 'Photoelectric Smoke Detector', manufacturer: 'Notifier', sku: 'FSP-851', unit: 'EA', qty: 86, notes: 'General areas' },
    { system: 'FIRE', category: 'Detector', description: 'Heat Detector, Rate-of-Rise', manufacturer: 'Notifier', sku: 'FST-851', unit: 'EA', qty: 12, notes: 'Kitchen/mech' },
    { system: 'FIRE', category: 'Detector', description: 'Duct Detector w/ Housing', manufacturer: 'Notifier', sku: '?"DNR-2', unit: 'EA', qty: 8, notes: 'HVAC ducts' },
    { system: 'FIRE', category: 'Pull Station', description: 'Manual Pull Station', manufacturer: 'Notifier', sku: 'NBG-12LX', unit: 'EA', qty: 16, notes: 'At exits' },
    { system: 'FIRE', category: 'NAC', description: 'Horn/Strobe, Wall, Red', manufacturer: 'Notifier', sku: 'P2RK', unit: 'EA', qty: 42, notes: 'General notification' },
    { system: 'FIRE', category: 'NAC', description: 'Horn/Strobe, Ceiling, Red', manufacturer: 'Notifier', sku: 'PC2RK', unit: 'EA', qty: 18, notes: 'Open areas' },
    { system: 'FIRE', category: 'NAC', description: 'Strobe Only, Wall, Red', manufacturer: 'Notifier', sku: 'P2R', unit: 'EA', qty: 8, notes: 'High noise areas' },
    { system: 'FIRE', category: 'Panel', description: 'Fire Alarm Control Panel', manufacturer: 'Notifier', sku: 'NFS2-3030', unit: 'EA', qty: 1, notes: 'Addressable' },
    { system: 'FIRE', category: 'Annunciator', description: 'Remote Annunciator', manufacturer: 'Notifier', sku: 'FDU-80', unit: 'EA', qty: 2, notes: 'Lobby, security' },
    { system: 'FIRE', category: 'Cable', description: '18/2 FPLP Shielded', manufacturer: 'West Penn', sku: '60982B', unit: 'FT', qty: 8400, notes: 'SLC circuit' },
    { system: 'FIRE', category: 'Cable', description: '14/2 FPLP', manufacturer: 'West Penn', sku: '60142B', unit: 'FT', qty: 4200, notes: 'NAC circuit' },
    { system: 'FIRE', category: 'Base', description: 'Detector Base Standard', manufacturer: 'Notifier', sku: 'B501', unit: 'EA', qty: 98, notes: '1 per detector' },
    { system: 'FIRE', category: 'Back Box', description: 'Back Box 4" Square', manufacturer: '?"', sku: '52151', unit: 'EA', qty: 76, notes: 'NAC devices' }
  ];

  // File Drop Handler
  const handleFileDrop = useCallback((e, type) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer?.files || e.target.files || []);
    console.log('📁 Files received:', files.map(f => ({ name: f.name, type: f.type, size: f.size })));

    // More permissive file validation - check extension if MIME type is empty
    const validFiles = files.filter(f => {
      const isPDF = f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf');
      const isImage = f.type.startsWith('image/') ||
        f.name.toLowerCase().endsWith('.jpg') ||
        f.name.toLowerCase().endsWith('.jpeg') ||
        f.name.toLowerCase().endsWith('.png');
      return isPDF || isImage;
    });

    console.log('✅ Valid files:', validFiles.map(f => f.name));

    if (type === 'plans') {
      setPlanFiles(prev => {
        const newFiles = [...prev, ...validFiles];
        console.log('📊 Plan files after add:', newFiles.length);
        return newFiles;
      });
    } else {
      setSpecFiles(prev => [...prev, ...validFiles]);
    }
  }, []);

  const removeFile = (type, index) => {
    if (type === 'plans') {
      setPlanFiles(prev => prev.filter((_, i) => i !== index));
    } else {
      setSpecFiles(prev => prev.filter((_, i) => i !== index));
    }
  };

  const canProceed = planFiles.length > 0;

  // Severity Colors
  const severityColors = {
    'CRITICAL': 'bg-red-500/20 text-red-300 border-red-500/30',
    'HIGH': 'bg-orange-500/20 text-orange-300 border-orange-500/30',
    'MEDIUM': 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
    'LOW': 'bg-blue-500/20 text-blue-300 border-blue-500/30'
  };

  const systemColors = {
    'CABLING': 'from-cyan-500 to-blue-600',
    'ACCESS': 'from-emerald-500 to-teal-600',
    'CCTV': 'from-purple-500 to-indigo-600',
    'FIRE': 'from-red-500 to-orange-600',
    // AI-generated system names
    'DATACOM': 'from-cyan-500 to-blue-600',
    'SECURITY': 'from-red-500 to-orange-600',
    'ACCESS CONTROL': 'from-emerald-500 to-teal-600',
    'A/V': 'from-purple-500 to-indigo-600'
  };

  // ============ Cloud Storage Handlers ============

  // Open existing project from dashboard
  const openProject = async (project) => {
    console.log('📂 Opening project:', project.job_number);
    try {
      const fullProject = await getProject(project.job_number);
      console.log('📦 Full project data:', fullProject);
      if (fullProject) {
        setActiveProject(fullProject);
        setProjectName(fullProject.project_name || 'Untitled Project');
        if (fullProject.device_counts) {
          setResults({ deviceCounts: fullProject.device_counts, issues: fullProject.issues || [] });
        } else {
          setResults(null); // Clear results if no device counts
        }
        if (fullProject.settings) setProjectSettings(fullProject.settings);

        // Load per-project PM password only - Op's MGR password is global/hardcoded
        setPasswords({
          estimator: OPS_MGR_PASSWORD, // Always use hardcoded Op's MGR password
          pm: fullProject.pm_password || 'PM1234' // PM/Lead password is per-project
        });
        setUserRole('viewer'); // Always start in view-only mode

        setShowDashboard(false);
        setCurrentStep(fullProject.device_counts ? 3 : 0); // Go to results if data exists
        console.log('✅ Project loaded in VIEW-ONLY mode. PM Password:', fullProject.pm_password);
      } else {
        alert('Project not found');
      }
    } catch (err) {
      console.error('Failed to open project:', err);
      alert('Failed to load project: ' + err.message);
    }
  };

  // Save current project to cloud
  const saveProjectToCloud = async () => {
    if (!activeProject) return;
    setIsSaving(true);
    try {
      await updateProject(activeProject.job_number, {
        project_name: projectName,
        device_counts: results?.deviceCounts,
        bom_data: results ? generateDetailedBOM(results) : null,
        settings: projectSettings,
        issues: results?.issues
      });
      setLastSaved(new Date());
      console.log('✅ Project saved to cloud');
    } catch (err) {
      console.error('Failed to save:', err);
    } finally {
      setIsSaving(false);
    }
  };

  // Auto-save when results change
  useEffect(() => {
    if (activeProject && results) {
      const timeout = setTimeout(saveProjectToCloud, 2000);
      return () => clearTimeout(timeout);
    }
  }, [results, projectSettings]);

  // Create new project and open it
  const createNewProject = async (project) => {
    setActiveProject(project);
    setProjectName(project.project_name);
    setShowDashboard(false);
    setCurrentStep(0);
    setResults(null);
    setPlanFiles([]);
    setSpecFiles([]);
  };

  // Back to dashboard
  const backToDashboard = () => {
    if (activeProject && results) {
      saveProjectToCloud();
    }
    setShowDashboard(true);
    setActiveProject(null);
  };

  // ============ Render ============

  // Show project dashboard
  if (showDashboard) {
    return (
      <ProjectDashboard
        onOpenProject={openProject}
        onCreateNew={createNewProject}
      />
    );
  }

  return (
    <div className="min-h-screen bg-black-pure text-white" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      {/* Background Pattern */}
      <div className="fixed inset-0 opacity-30">
        <div className="absolute inset-0" style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, rgba(212, 175, 55, 0.1) 1px, transparent 0)`,
          backgroundSize: '40px 40px'
        }} />
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-gold/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-gold/5 rounded-full blur-3xl" />
      </div>

      {/* Header */}
      <header className="relative border-b border-gold/30 backdrop-blur-xl bg-black-medium/80">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {/* Back to Dashboard Button */}
              <button
                onClick={backToDashboard}
                className="flex items-center gap-2 px-4 py-2 bg-cyan-600/20 border border-cyan-500/50 hover:bg-cyan-600/30 text-cyan-400 hover:text-cyan-300 rounded-lg transition-all"
                title="Back to Projects"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="text-sm font-medium">Projects</span>
              </button>

              <img src="/logo.png" alt="3D Technology Services" style={{ height: '240px', width: 'auto' }} />
              <div>
                <h1 className="text-xl font-bold tracking-tight text-gold">LV Takeoff Intelligence</h1>
                <div className="flex items-center gap-2">
                  <p className="text-xs text-gold/60">AI-Powered Low-Voltage Estimation</p>
                  {activeProject && (
                    <>
                      <span className="text-gold/30">•</span>
                      <span className="text-xs text-cyan-400 font-mono">{activeProject.job_number}</span>
                      <span className="text-gold/30">•</span>
                      <span className="text-xs text-slate-400">{projectName}</span>
                    </>
                  )}
                </div>
                {/* Auto-save indicator */}
                {activeProject && (
                  <div className="flex items-center gap-2 mt-1">
                    {isSaving ? (
                      <span className="text-xs text-amber-400 flex items-center gap-1">
                        <Loader2 className="w-3 h-3 animate-spin" /> Saving...
                      </span>
                    ) : lastSaved ? (
                      <span className="text-xs text-emerald-400/60 flex items-center gap-1">
                        <Save className="w-3 h-3" /> Saved {lastSaved.toLocaleTimeString()}
                      </span>
                    ) : null}
                  </div>
                )}
              </div>
            </div>

            {/* Step Progress */}
            <div className="flex items-center gap-2">
              {steps.map((step, idx) => {
                const Icon = step.icon;
                const isActive = idx === currentStep;
                const isComplete = idx < currentStep;

                return (
                  <React.Fragment key={step.id}>
                    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all ${isActive ? 'bg-gold/20 text-gold' :
                      isComplete ? 'bg-emerald-500/20 text-emerald-400' :
                        'text-slate-600'
                      }`}>
                      {isComplete ? (
                        <CheckCircle className="w-4 h-4" />
                      ) : (
                        <Icon className="w-4 h-4" />
                      )}
                      <span className="text-sm font-medium hidden sm:inline">{step.name}</span>
                    </div>
                    {idx < steps.length - 1 && (
                      <ChevronRight className={`w-4 h-4 ${isComplete ? 'text-emerald-500' : 'text-gold/30'}`} />
                    )}
                  </React.Fragment>
                );
              })}
            </div>

            {/* Edit Mode Button */}
            {activeProject && (
              <div className="flex items-center gap-3">
                {userRole === 'viewer' ? (
                  <button
                    onClick={() => setShowPasswordModal('edit')}
                    className="flex items-center gap-2 px-4 py-2 bg-amber-500/20 border border-amber-500/50 text-amber-400 rounded-lg hover:bg-amber-500/30 transition-all"
                    title="Click to enter edit mode"
                  >
                    <Lock className="w-4 h-4" />
                    <span className="text-sm font-medium">View Only</span>
                  </button>
                ) : (
                  <div className="flex items-center gap-2 px-4 py-2 bg-emerald-500/20 border border-emerald-500/50 text-emerald-400 rounded-lg">
                    <Unlock className="w-4 h-4" />
                    <span className="text-sm font-medium">
                      {userRole === 'ops' ? 'Ops Manager' : 'PM Access'}
                    </span>
                    <button
                      onClick={() => setUserRole('viewer')}
                      className="ml-2 p-1 hover:bg-emerald-500/30 rounded"
                      title="Exit edit mode"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>
            )}

          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative max-w-7xl mx-auto px-6 py-8">

        {/* Step 0: Upload Files */}
        {currentStep === 0 && (
          <div className="space-y-8 animate-in fade-in duration-500">
            {/* Project Name */}
            <div>
              <label className="block text-sm font-medium text-gold/80 mb-2">Project Name</label>
              <input
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="Enter project name..."
                className="w-full max-w-md px-4 py-3 bg-black-medium border border-gold/30 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-gold/50 focus:border-gold/50 placeholder-slate-500 transition-all"
              />
            </div>

            <div className="grid lg:grid-cols-2 gap-8">
              {/* Floor Plans Upload */}
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-gold/20 flex items-center justify-center">
                    <Grid3X3 className="w-4 h-4 text-gold" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gold">Floor Plans & LV Sheets</h3>
                    <p className="text-xs text-gold/50">PDF, JPG, PNG • Required</p>
                  </div>
                </div>

                <div
                  onDrop={(e) => handleFileDrop(e, 'plans')}
                  onDragOver={(e) => e.preventDefault()}
                  className="relative border-2 border-dashed border-gold/30 rounded-2xl p-8 hover:border-gold/60 hover:bg-gold/5 transition-all cursor-pointer group"
                >
                  <input
                    type="file"
                    multiple
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={(e) => handleFileDrop(e, 'plans')}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <div className="text-center">
                    <Upload className="w-12 h-12 text-gold/40 mx-auto mb-4 group-hover:text-gold transition-colors" />
                    <p className="text-gold/70 mb-2">Drop floor plans here or click to browse</p>
                    <p className="text-xs text-gold/40">Telecom, Security, Fire Alarm sheets</p>
                  </div>
                </div>

                {/* Uploaded Plans List */}
                {planFiles.length > 0 && (
                  <div className="space-y-2">
                    {planFiles.map((file, idx) => (
                      <div key={idx} className="flex items-center justify-between px-4 py-3 bg-black-medium rounded-xl border border-gold/20">
                        <div className="flex items-center gap-3">
                          <FileText className="w-5 h-5 text-gold" />
                          <div>
                            <p className="text-sm font-medium truncate max-w-xs">{file.name}</p>
                            <p className="text-xs text-gold/50">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                          </div>
                        </div>
                        <button onClick={() => removeFile('plans', idx)} className="p-1.5 hover:bg-gold/10 rounded-lg transition-colors">
                          <X className="w-4 h-4 text-gold/60" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Specifications Upload */}
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-gold/20 flex items-center justify-center">
                    <FileText className="w-4 h-4 text-gold" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gold">Specifications</h3>
                    <p className="text-xs text-gold/50">PDF • Optional but recommended</p>
                  </div>
                </div>

                <div
                  onDrop={(e) => handleFileDrop(e, 'specs')}
                  onDragOver={(e) => e.preventDefault()}
                  className="relative border-2 border-dashed border-gold/30 rounded-2xl p-8 hover:border-gold/60 hover:bg-gold/5 transition-all cursor-pointer group"
                >
                  <input
                    type="file"
                    multiple
                    accept=".pdf"
                    onChange={(e) => handleFileDrop(e, 'specs')}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <div className="text-center">
                    <FileText className="w-12 h-12 text-gold/40 mx-auto mb-4 group-hover:text-gold transition-colors" />
                    <p className="text-gold/70 mb-2">Drop specification PDFs here</p>
                    <p className="text-xs text-gold/40">Division 27 & 28 specs</p>
                  </div>
                </div>

                {/* Uploaded Specs List */}
                {specFiles.length > 0 && (
                  <div className="space-y-2">
                    {specFiles.map((file, idx) => (
                      <div key={idx} className="flex items-center justify-between px-4 py-3 bg-black-medium rounded-xl border border-gold/20">
                        <div className="flex items-center gap-3">
                          <FileText className="w-5 h-5 text-gold" />
                          <div>
                            <p className="text-sm font-medium truncate max-w-xs">{file.name}</p>
                            <p className="text-xs text-gold/50">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                          </div>
                        </div>
                        <button onClick={() => removeFile('specs', idx)} className="p-1.5 hover:bg-gold/10 rounded-lg transition-colors">
                          <X className="w-4 h-4 text-gold/60" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Systems to Analyze */}
            <div>
              <h3 className="text-sm font-medium text-gold/80 mb-4">Systems to Analyze</h3>
              <div className="flex flex-wrap gap-3">
                {[
                  { id: 'cabling', label: 'Structured Cabling', icon: Cable },
                  { id: 'access', label: 'Access Control', icon: Shield },
                  { id: 'cctv', label: 'CCTV', icon: Camera },
                  { id: 'fire', label: 'Fire Alarm', icon: Flame }
                ].map(sys => {
                  const Icon = sys.icon;
                  return (
                    <button
                      key={sys.id}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl border transition-all bg-black-medium border-gold/50 text-gold hover:bg-gold/10 hover:border-gold"
                    >
                      <Icon className="w-4 h-4" />
                      <span className="text-sm font-medium">{sys.label}</span>
                      <CheckCircle className="w-4 h-4 ml-1" />
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Action Button */}
            <div className="flex justify-end pt-4">
              <button
                onClick={processDocuments}
                disabled={!canProceed}
                className={`flex items-center gap-3 px-8 py-4 rounded-xl font-semibold text-lg transition-all ${canProceed
                  ? 'bg-black-medium border-2 border-gold text-gold shadow-lg shadow-gold/25 hover:bg-gold hover:text-black hover:shadow-xl hover:shadow-gold/40 hover:scale-[1.02]'
                  : 'bg-black-light border border-gold/20 text-gold/40 cursor-not-allowed'
                  }`}
              >
                <Zap className="w-5 h-5" />
                Analyze Documents
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Processing */}
        {currentStep === 2 && (
          <div className="flex flex-col items-center justify-center min-h-[60vh] animate-in fade-in duration-500">
            <div className="w-full max-w-lg space-y-8">
              {/* Animated Icon */}
              <div className="relative w-32 h-32 mx-auto">
                <div className="absolute inset-0 bg-gold/20 rounded-full animate-ping" />
                <div className="absolute inset-2 bg-gold/30 rounded-full animate-pulse" />
                <div className="absolute inset-4 bg-black-medium border-2 border-gold rounded-full flex items-center justify-center shadow-xl shadow-gold/30">
                  <Loader2 className="w-12 h-12 text-gold animate-spin" />
                </div>
              </div>

              {/* Status */}
              <div className="text-center space-y-2">
                <h2 className="text-2xl font-bold text-gold">Processing Documents</h2>
                <p className="text-gold/60">{processingStatus}</p>
              </div>

              {/* Progress Bar */}
              <div className="space-y-2">
                <div className="h-3 bg-black-medium border border-gold/30 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-gold-dark to-gold rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${processingProgress}%` }}
                  />
                </div>
                <p className="text-center text-sm text-gold/60">{processingProgress}% Complete</p>
              </div>

              {/* Processing Steps */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                {[
                  { label: 'Spec Parsing', done: processingProgress > 25 },
                  { label: 'Legend Detection', done: processingProgress > 45 },
                  { label: 'Symbol Detection', done: processingProgress > 55 },
                  { label: 'Closet Detection', done: processingProgress > 65 },
                  { label: 'Cable Routing', done: processingProgress > 80 },
                  { label: 'BOM Generation', done: processingProgress > 95 }
                ].map((step, idx) => (
                  <div key={idx} className={`flex items-center gap-2 px-3 py-2 rounded-lg ${step.done ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-800/50 text-slate-500'}`}>
                    {step.done ? <CheckCircle className="w-4 h-4" /> : <div className="w-4 h-4 rounded-full border-2 border-current" />}
                    {step.label}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Results */}
        {currentStep === 3 && results && (
          <div className="space-y-6 animate-in fade-in duration-500">
            {/* Results Header */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold">{results.project}</h2>
                <p className="text-slate-500">Takeoff completed • {new Date(results.processedAt).toLocaleString()}</p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setShowOverlay(true)}
                  className="flex items-center gap-2 px-4 py-2.5 bg-black-medium border border-gold/50 text-gold rounded-xl shadow-lg shadow-gold/20 hover:bg-gold/10 hover:border-gold hover:shadow-xl hover:scale-105 transition-all font-medium"
                >
                  <Eye className="w-4 h-4" />
                  👁️ View Overlays
                </button>
                <button className="flex items-center gap-2 px-4 py-2.5 bg-black-medium border border-gold text-gold rounded-xl shadow-lg shadow-gold/20 hover:bg-gold hover:text-black hover:shadow-xl transition-all font-medium">
                  <Download className="w-4 h-4" />
                  Export Package
                </button>
              </div>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Total Devices', value: Object.values(getFilteredDeviceCounts()).reduce((sum, sys) => sum + Object.values(sys).reduce((s, d) => s + d.qty, 0), 0).toLocaleString(), icon: Layers, color: 'cyan' },
                { label: 'Cable Length', value: `${(getDynamicTotalCableFt() / 1000).toFixed(1)}K ft`, icon: Cable, color: 'blue' },
                { label: 'J-Hooks', value: getDynamicJHookCount().toLocaleString(), icon: Grid3X3, color: 'purple' },
                { label: 'Issues Found', value: results.issues.length, icon: AlertTriangle, color: results.issues.filter(i => i.severity === 'CRITICAL').length > 0 ? 'red' : 'yellow' }
              ].map((stat, idx) => {
                const Icon = stat.icon;
                return (
                  <div key={idx} className="p-5 bg-black-medium rounded-2xl border border-gold/30">
                    <div className="w-10 h-10 rounded-xl bg-gold/20 flex items-center justify-center mb-3">
                      <Icon className="w-5 h-5 text-gold" />
                    </div>
                    <p className="text-2xl font-bold text-gold">{stat.value}</p>
                    <p className="text-sm text-gold/60">{stat.label}</p>
                  </div>
                );
              })}
            </div>

            {/* Role Selector */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1 p-1 bg-black-medium rounded-xl border border-gold/30 w-fit">
                <span className="px-3 py-2 text-sm text-gold/60">Role:</span>
                {[
                  { id: 'estimator', label: "Op's MGR", requiresPassword: true },
                  { id: 'pm', label: 'PM/Lead', requiresPassword: true },
                  { id: 'viewer', label: 'Viewer', requiresPassword: false }
                ].map(role => (
                  <button
                    key={role.id}
                    onClick={() => {
                      if (role.requiresPassword && userRole !== role.id) {
                        setShowPasswordModal(role.id);
                        setPasswordInput('');
                        setPasswordError('');
                      } else {
                        setUserRole(role.id);
                      }
                    }}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${userRole === role.id
                      ? 'bg-gold text-black'
                      : 'bg-black-light border border-gold/30 text-gold hover:bg-gold/10 hover:border-gold'
                      }`}
                  >
                    {role.requiresPassword && userRole !== role.id ? '🔒 ' : ''}{role.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Password Modal */}
            {showPasswordModal && (
              <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
                <div className="bg-black-medium rounded-2xl border border-gold/50 p-6 max-w-sm w-full mx-4">
                  <h3 className="text-lg font-bold text-gold mb-4">
                    Enter {showPasswordModal === 'estimator' ? "Op's MGR" : 'PM/Lead'} Password
                  </h3>
                  <input
                    type="password"
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    placeholder="Enter password..."
                    className="w-full px-4 py-3 bg-black-light border border-gold/30 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-gold/50 focus:border-gold mb-2"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        if (passwordInput === passwords[showPasswordModal]) {
                          setUserRole(showPasswordModal);
                          setShowPasswordModal(null);
                          setPasswordInput('');
                          setPasswordError('');
                        } else {
                          setPasswordError('Incorrect password');
                        }
                      }
                    }}
                  />
                  {passwordError && <p className="text-red-400 text-sm mb-3">{passwordError}</p>}
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => { setShowPasswordModal(null); setPasswordInput(''); setPasswordError(''); }}
                      className="px-4 py-2 border border-gold/30 text-gold rounded-lg hover:bg-gold/10 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => {
                        if (passwordInput === passwords[showPasswordModal]) {
                          setUserRole(showPasswordModal);
                          setShowPasswordModal(null);
                          setPasswordInput('');
                          setPasswordError('');
                        } else {
                          setPasswordError('Incorrect password');
                        }
                      }}
                      className="px-4 py-2 bg-gold text-black rounded-lg hover:bg-gold-light transition-colors font-medium"
                    >
                      Login
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Tabs */}
            <div className="flex items-center gap-1 p-1 bg-black-medium rounded-xl border border-gold/30 w-fit flex-wrap">
              {[
                { id: 'summary', label: 'Summary' },
                { id: 'devices', label: 'Device Counts' },
                { id: 'cable', label: 'Cable' },
                { id: 'bom', label: 'Master BOM' },
                { id: 'detailedBom', label: 'Detailed BOM', access: ['estimator', 'pm', 'viewer'], editAccess: 'estimator' },
                { id: 'pmPortal', label: 'PM Portal', access: ['estimator', 'pm', 'viewer'], editAccess: 'pm' },
                { id: 'settings', label: 'Settings', access: ['estimator'] },
                { id: 'issues', label: `Issues (${results.issues.length})` }
              ].map(tab => {
                const hasAccess = !tab.access || tab.access.includes(userRole);

                if (!hasAccess) {
                  return (
                    <button
                      key={tab.id}
                      disabled
                      className="px-4 py-2 rounded-lg text-sm font-medium text-gold/30 cursor-not-allowed opacity-50 border border-gold/10"
                      title={`Access restricted - ${tab.access?.join(' or ')} only`}
                    >
                      🔒 {tab.label}
                    </button>
                  );
                }

                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === tab.id
                      ? 'bg-gold text-black'
                      : 'bg-black-light border border-gold/30 text-gold hover:bg-gold/10 hover:border-gold'
                      }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* Tab Content */}
            <div className="bg-black-medium rounded-2xl border border-gold/30 overflow-hidden">
              {/* Summary Tab */}
              {activeTab === 'summary' && (
                <div className="p-6 space-y-6">
                  <h3 className="text-lg font-semibold">System Summary</h3>
                  <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {Object.entries(getFilteredDeviceCounts()).map(([system, devices]) => {
                      const Icon = systemIcons[system] || Cable;
                      const totalDevices = Object.values(devices).reduce((sum, d) => sum + (d.qty || 0), 0);
                      return (
                        <div key={system} className="p-5 bg-slate-800/30 rounded-xl border border-slate-700/30">
                          <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${systemColors[system] || 'from-slate-500 to-slate-600'} flex items-center justify-center mb-3 shadow-lg`}>
                            {Icon && <Icon className="w-5 h-5 text-white" />}
                          </div>
                          <h4 className="font-semibold mb-3">{system}</h4>
                          <div className="space-y-2">
                            {Object.entries(devices).map(([type, data]) => (
                              <div key={type} className="flex justify-between text-sm">
                                <span className="text-slate-400">{type}</span>
                                <span className="font-medium">{data.qty}</span>
                              </div>
                            ))}
                          </div>
                          <div className="mt-3 pt-3 border-t border-slate-700/50 flex justify-between">
                            <span className="text-slate-500 text-sm">Total</span>
                            <span className="font-bold text-lg">{totalDevices}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Closet Summary */}
                  <div>
                    <h3 className="text-lg font-semibold mb-4">Closet Summary</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="text-left text-sm text-slate-500 border-b border-slate-800">
                            <th className="pb-3 font-medium">Closet</th>
                            <th className="pb-3 font-medium">Type</th>
                            <th className="pb-3 font-medium">Floor</th>
                            <th className="pb-3 font-medium">Room Location</th>
                            <th className="pb-3 font-medium text-right">Data</th>
                            <th className="pb-3 font-medium text-right">Voice</th>
                            <th className="pb-3 font-medium text-right">Fiber</th>
                            <th className="pb-3 font-medium text-right">Cable Runs</th>
                            <th className="pb-3 font-medium text-right">Total Ft</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(results.closets || []).map((closet, idx) => {
                            const typeColors = {
                              'MDF': 'bg-cyan-500/20 text-cyan-400',
                              'IDF': 'bg-slate-700 text-slate-300',
                              'FACP': 'bg-red-500/20 text-red-400',
                              'SEC': 'bg-emerald-500/20 text-emerald-400'
                            };
                            return (
                              <tr key={idx} className="border-b border-slate-800/50 hover:bg-slate-800/20">
                                <td className="py-3 font-medium">{closet.name || 'Unknown'}</td>
                                <td className="py-3"><span className={`px-2 py-1 rounded text-xs ${typeColors[closet.type] || 'bg-slate-700 text-slate-300'}`}>{closet.type || 'IDF'}</span></td>
                                <td className="py-3 text-slate-400">{closet.floor || '-'}</td>
                                <td className="py-3 text-slate-400">{closet.room || closet.location || '-'}</td>
                                <td className="py-3 text-right">{closet.dataPorts || '-'}</td>
                                <td className="py-3 text-right">{closet.voicePorts || '-'}</td>
                                <td className="py-3 text-right">{closet.fiberPorts || '-'}</td>
                                <td className="py-3 text-right">{closet.cableRuns || '-'}</td>
                                <td className="py-3 text-right font-medium">{closet.totalCableFt?.toLocaleString() || '-'}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Unit Types from T4.02 Room Breakouts */}
                  {results.unitTypes && results.unitTypes.length > 0 && (
                    <div>
                      <h3 className="text-lg font-semibold mb-4">Unit Types (Room Breakouts from T4.02)</h3>
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr className="text-left text-sm text-slate-500 border-b border-slate-800">
                              <th className="pb-3 font-medium">Unit Type</th>
                              <th className="pb-3 font-medium">Description</th>
                              <th className="pb-3 font-medium">Sheet</th>
                              <th className="pb-3 font-medium text-right">Count</th>
                              <th className="pb-3 font-medium">Devices Per Unit</th>
                              <th className="pb-3 font-medium text-right">Total Devices</th>
                            </tr>
                          </thead>
                          <tbody>
                            {results.unitTypes.map((unit, idx) => (
                              <tr key={idx} className="border-b border-slate-800/50 hover:bg-slate-800/20">
                                <td className="py-3 font-medium"><span className="px-2 py-1 rounded text-xs bg-purple-500/20 text-purple-400">{unit.type}</span></td>
                                <td className="py-3 text-slate-400">{unit.description}</td>
                                <td className="py-3 text-slate-500">{unit.sheet}</td>
                                <td className="py-3 text-right font-medium">{unit.count}</td>
                                <td className="py-3 text-slate-400 text-sm">
                                  {Object.entries(unit.devicesPerUnit).map(([device, qty]) => (
                                    <span key={device} className="mr-2">{device}: {qty}</span>
                                  ))}
                                </td>
                                <td className="py-3 text-right font-bold text-cyan-400">{unit.totalDevices}</td>
                              </tr>
                            ))}
                            <tr className="bg-slate-800/30">
                              <td className="py-3 font-bold" colSpan="5">Total Units & Devices</td>
                              <td className="py-3 text-right font-bold text-lg text-emerald-400">
                                {results.unitTypes.reduce((sum, u) => sum + u.totalDevices, 0)}
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Device Counts Tab */}
              {activeTab === 'devices' && (
                <div className="p-6">
                  <div className="space-y-8">
                    {Object.entries(getFilteredDeviceCounts()).map(([system, devices]) => {
                      const Icon = systemIcons[system] || Cable;
                      return (
                        <div key={system}>
                          <div className="flex items-center gap-3 mb-4">
                            <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${systemColors[system] || 'from-slate-500 to-slate-600'} flex items-center justify-center`}>
                              {Icon && <Icon className="w-4 h-4 text-white" />}
                            </div>
                            <h3 className="text-lg font-semibold">{system}</h3>
                          </div>
                          <div className="overflow-x-auto">
                            <table className="w-full">
                              <thead>
                                <tr className="text-left text-sm text-slate-500 border-b border-slate-800">
                                  <th className="pb-3 font-medium">Device Type</th>
                                  <th className="pb-3 font-medium text-right">Level 1</th>
                                  <th className="pb-3 font-medium text-right">Level 2</th>
                                  <th className="pb-3 font-medium text-right">Level 3</th>
                                  <th className="pb-3 font-medium text-right">Total</th>
                                </tr>
                              </thead>
                              <tbody>
                                {Object.entries(devices).map(([type, data]) => (
                                  <tr key={type} className="border-b border-slate-800/50 hover:bg-slate-800/20">
                                    <td className="py-3">{type}</td>
                                    <td className="py-3 text-right text-slate-400">{data.byFloor['Level 1']}</td>
                                    <td className="py-3 text-right text-slate-400">{data.byFloor['Level 2']}</td>
                                    <td className="py-3 text-right text-slate-400">{data.byFloor['Level 3']}</td>
                                    <td className="py-3 text-right font-semibold">{data.qty}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Cable Tab */}
              {activeTab === 'cable' && (() => {
                const settings = getCablingSettings();
                const totalRuns = getTotalCableRuns();
                const dynamicServiceLoopFt = totalRuns * settings.serviceLoopLength;
                const dynamicCableSummary = getDynamicCableSummary();

                return (
                  <div className="p-6 space-y-6">
                    <div className="grid md:grid-cols-4 gap-4">
                      <div className="p-5 bg-slate-800/30 rounded-xl">
                        <p className="text-sm text-slate-500 mb-1">Total Cable</p>
                        <p className="text-3xl font-bold">{getDynamicTotalCableFt().toLocaleString()} <span className="text-lg text-slate-500">ft</span></p>
                      </div>
                      <div className="p-5 bg-slate-800/30 rounded-xl">
                        <p className="text-sm text-slate-500 mb-1">Service Loops</p>
                        <p className="text-3xl font-bold">{dynamicServiceLoopFt.toLocaleString()} <span className="text-lg text-slate-500">ft</span></p>
                        <p className="text-xs text-slate-600">{totalRuns} runs × {settings.serviceLoopLength}ft</p>
                      </div>
                      <div className="p-5 bg-slate-800/30 rounded-xl">
                        <p className="text-sm text-slate-500 mb-1">J-Hooks Required</p>
                        <p className="text-3xl font-bold">{getDynamicJHookCount().toLocaleString()}</p>
                        <p className="text-xs text-slate-600">{totalRuns} runs × {Math.ceil(settings.avgCableRunLength / settings.jHookSpacing)}/run</p>
                      </div>
                      <div className="p-5 bg-slate-800/30 rounded-xl">
                        <p className="text-sm text-slate-500 mb-1">Settings Applied</p>
                        <p className="text-sm text-cyan-400">{settings.avgCableRunLength}ft avg run</p>
                        <p className="text-xs text-slate-600">{settings.wastePercentage}% waste • {settings.jHookSpacing}ft spacing</p>
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="text-left text-sm text-slate-500 border-b border-slate-800">
                            <th className="pb-3 font-medium">Cable Type</th>
                            <th className="pb-3 font-medium">System</th>
                            <th className="pb-3 font-medium text-right">Total Ft</th>
                            <th className="pb-3 font-medium text-right">Boxes ({settings.feetPerBox}ft)</th>
                            <th className="pb-3 font-medium text-right">w/ {settings.wastePercentage}% Waste</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(dynamicCableSummary)
                            .filter(([_, data]) => isSystemEnabled(data.system))
                            .map(([type, data]) => (
                              <tr key={type} className="border-b border-slate-800/50 hover:bg-slate-800/20">
                                <td className="py-3 font-medium">{type}</td>
                                <td className="py-3"><span className={`px-2 py-1 rounded text-xs bg-gradient-to-r ${systemColors[data.system] || 'from-slate-500 to-slate-600'} text-white`}>{data.system}</span></td>
                                <td className="py-3 text-right">{data.totalFt.toLocaleString()}</td>
                                <td className="py-3 text-right">{data.boxes}</td>
                                <td className="py-3 text-right font-medium">{Math.ceil(data.totalFt * data.waste / settings.feetPerBox)}</td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}

              {/* Master BOM Tab */}
              {activeTab === 'bom' && (() => {
                const bomTotals = getMasterBomTotals();
                const laborBreakdown = calculateLaborByPosition(bomTotals.laborHours);
                const grandTotal = bomTotals.materialCost + laborBreakdown.totalCost;

                return (
                  <div className="p-6 space-y-6">
                    {/* Summary Cards - Material */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="p-5 bg-slate-800/30 rounded-xl border border-emerald-500/30">
                        <p className="text-sm text-slate-500 mb-1">Total Material</p>
                        <p className="text-2xl font-bold text-emerald-400">${bomTotals.materialCost.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</p>
                      </div>
                      <div className="p-5 bg-slate-800/30 rounded-xl border border-cyan-500/30">
                        <p className="text-sm text-slate-500 mb-1">Total Labor Hours</p>
                        <p className="text-2xl font-bold text-cyan-400">{bomTotals.laborHours.toFixed(0)} hrs</p>
                      </div>
                      <div className="p-5 bg-slate-800/30 rounded-xl border border-amber-500/30">
                        <p className="text-sm text-slate-500 mb-1">Total Labor Cost</p>
                        <p className="text-2xl font-bold text-amber-400">${laborBreakdown.totalCost.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</p>
                        <p className="text-xs text-slate-500">Blended rate: ${laborBreakdown.blendedRate.toFixed(2)}/hr</p>
                      </div>
                      <div className="p-5 bg-slate-800/30 rounded-xl border border-gold/50">
                        <p className="text-sm text-slate-500 mb-1">GRAND TOTAL</p>
                        <p className="text-2xl font-bold text-gold">${grandTotal.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</p>
                      </div>
                    </div>

                    {/* Labor Breakdown by Position */}
                    <div className="bg-slate-800/30 rounded-xl border border-slate-700/50 overflow-hidden">
                      <div className="p-4 border-b border-slate-700/50 bg-slate-800/50">
                        <h4 className="font-semibold text-white flex items-center gap-2">
                          <Clock className="w-4 h-4 text-cyan-400" />
                          Labor Distribution by Position (Industry Standard)
                        </h4>
                        <p className="text-xs text-slate-500 mt-1">Based on typical LV project staffing: Technician 60%, Lead Tech 20%, PM 10%, Apprentice 10%</p>
                      </div>
                      <div className="p-4">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-left text-slate-500 border-b border-slate-700/50">
                              <th className="pb-3 font-medium">Position</th>
                              <th className="pb-3 font-medium text-center">% of Project</th>
                              <th className="pb-3 font-medium text-right">Hours</th>
                              <th className="pb-3 font-medium text-right">Rate</th>
                              <th className="pb-3 font-medium text-right">Cost</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr className="border-b border-slate-800/30 hover:bg-slate-800/20">
                              <td className="py-3 font-medium">Technician</td>
                              <td className="py-3 text-center text-slate-400">60%</td>
                              <td className="py-3 text-right text-cyan-400">{laborBreakdown.technician.hours.toFixed(1)} hrs</td>
                              <td className="py-3 text-right text-slate-400">${laborBreakdown.technician.rate}/hr</td>
                              <td className="py-3 text-right text-amber-400">${laborBreakdown.technician.cost.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                            </tr>
                            <tr className="border-b border-slate-800/30 hover:bg-slate-800/20">
                              <td className="py-3 font-medium">Lead Technician</td>
                              <td className="py-3 text-center text-slate-400">20%</td>
                              <td className="py-3 text-right text-cyan-400">{laborBreakdown.leadTech.hours.toFixed(1)} hrs</td>
                              <td className="py-3 text-right text-slate-400">${laborBreakdown.leadTech.rate}/hr</td>
                              <td className="py-3 text-right text-amber-400">${laborBreakdown.leadTech.cost.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                            </tr>
                            <tr className="border-b border-slate-800/30 hover:bg-slate-800/20">
                              <td className="py-3 font-medium">Project Manager</td>
                              <td className="py-3 text-center text-slate-400">10%</td>
                              <td className="py-3 text-right text-cyan-400">{laborBreakdown.projectManager.hours.toFixed(1)} hrs</td>
                              <td className="py-3 text-right text-slate-400">${laborBreakdown.projectManager.rate}/hr</td>
                              <td className="py-3 text-right text-amber-400">${laborBreakdown.projectManager.cost.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                            </tr>
                            <tr className="hover:bg-slate-800/20">
                              <td className="py-3 font-medium">Apprentice</td>
                              <td className="py-3 text-center text-slate-400">10%</td>
                              <td className="py-3 text-right text-cyan-400">{laborBreakdown.apprentice.hours.toFixed(1)} hrs</td>
                              <td className="py-3 text-right text-slate-400">${laborBreakdown.apprentice.rate}/hr</td>
                              <td className="py-3 text-right text-amber-400">${laborBreakdown.apprentice.cost.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                            </tr>
                          </tbody>
                          <tfoot>
                            <tr className="border-t-2 border-gold/50 font-semibold">
                              <td className="py-3 text-white">TOTALS</td>
                              <td className="py-3 text-center text-white">100%</td>
                              <td className="py-3 text-right text-cyan-400">{laborBreakdown.totalHours.toFixed(1)} hrs</td>
                              <td className="py-3 text-right text-slate-400">${laborBreakdown.blendedRate.toFixed(2)}/hr avg</td>
                              <td className="py-3 text-right text-gold">${laborBreakdown.totalCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>

                    {/* Header with Export Buttons */}
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-lg font-semibold">Master Bill of Materials</h3>
                        <p className="text-sm text-slate-500">{bomTotals.itemCount} line items • All systems included</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={exportForPricing}
                          className="flex items-center gap-2 px-3 py-1.5 bg-cyan-500/20 text-cyan-400 rounded-lg text-sm hover:bg-cyan-500/30 transition-colors"
                          title="Export material list only (no prices) to send to vendors for pricing"
                        >
                          <FileSpreadsheet className="w-4 h-4" />
                          Export for Pricing
                        </button>
                        <button
                          onClick={exportProposal}
                          className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/20 text-emerald-400 rounded-lg text-sm hover:bg-emerald-500/30 transition-colors"
                          title="Export full proposal with pricing and labor breakdown for customer quotes"
                        >
                          <FileSpreadsheet className="w-4 h-4" />
                          Export Proposal
                        </button>
                      </div>
                    </div>

                    {/* BOM Table with Pricing */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-slate-500 border-b border-slate-800">
                            <th className="pb-3 font-medium">System</th>
                            <th className="pb-3 font-medium">Category</th>
                            <th className="pb-3 font-medium">Description</th>
                            <th className="pb-3 font-medium">Manufacturer</th>
                            <th className="pb-3 font-medium">SKU</th>
                            <th className="pb-3 font-medium text-center">Unit</th>
                            <th className="pb-3 font-medium text-right">Qty</th>
                            <th className="pb-3 font-medium text-right">Unit $</th>
                            <th className="pb-3 font-medium text-right">Ext $</th>
                            <th className="pb-3 font-medium text-right">Labor Hrs</th>
                          </tr>
                        </thead>
                        <tbody>
                          {getDynamicBomItems().map((item, idx) => (
                            <tr key={idx} className="border-b border-slate-800/30 hover:bg-slate-800/20">
                              <td className="py-2.5"><span className={`px-2 py-0.5 rounded text-xs bg-gradient-to-r ${systemColors[item.system] || 'from-slate-500 to-slate-600'} text-white`}>{item.system}</span></td>
                              <td className="py-2.5 text-slate-400">{item.category}</td>
                              <td className="py-2.5">{item.description}</td>
                              <td className="py-2.5 text-slate-400">{item.manufacturer}</td>
                              <td className="py-2.5 font-mono text-xs text-slate-500">{item.sku}</td>
                              <td className="py-2.5 text-center text-slate-400">{item.unit}</td>
                              <td className="py-2.5 text-right font-medium">{item.qty.toLocaleString()}</td>
                              <td className="py-2.5 text-right text-slate-400">${item.unitCost.toFixed(2)}</td>
                              <td className="py-2.5 text-right text-emerald-400">${(item.qty * item.unitCost).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                              <td className="py-2.5 text-right text-cyan-400">{(item.qty * item.laborHrs).toFixed(1)}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="border-t-2 border-gold/50 font-semibold">
                            <td colSpan="8" className="py-3 text-right text-white">TOTALS:</td>
                            <td className="py-3 text-right text-emerald-400">${bomTotals.materialCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                            <td className="py-3 text-right text-cyan-400">{bomTotals.laborHours.toFixed(1)} hrs</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>

                    {/* Note about estimated pricing */}
                    <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl">
                      <p className="text-sm text-amber-400">
                        <strong>Note:</strong> Labor distribution based on industry standards for LV installation projects. Rates are pulled from Settings. Use "Export for Pricing" for vendor quotes (material only), "Export Proposal" for customer estimates (full breakdown).
                      </p>
                    </div>
                  </div>
                );
              })()}

              {/* Detailed BOM Tab */}
              {activeTab === 'detailedBom' && (
                <div className="p-6">
                  <DetailedBOM results={results} canEdit={userRole === 'estimator'} laborRates={projectSettings?.laborRates} />
                </div>
              )}

              {/* PM Portal Tab */}
              {activeTab === 'pmPortal' && (
                <div className="p-6">
                  <ProjectManagerPortal
                    bomData={generateDetailedBOM(results)}
                    canEdit={userRole === 'pm'}
                    passwords={passwords}
                    onPasswordChange={setPasswords}
                  />
                </div>
              )}

              {/* Settings Tab */}
              {activeTab === 'settings' && (
                <div className="p-6">
                  <SettingsPortal
                    settings={projectSettings}
                    onSettingsChange={setProjectSettings}
                    passwords={passwords}
                    onPasswordsChange={setPasswords}
                  />
                </div>
              )}

              {/* Issues Tab */}
              {activeTab === 'issues' && (
                <div className="p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold">Issues & RFIs</h3>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="px-2 py-1 bg-red-500/20 text-red-400 rounded">{results.issues.filter(i => i.severity === 'CRITICAL').length} Critical</span>
                      <span className="px-2 py-1 bg-orange-500/20 text-orange-400 rounded">{results.issues.filter(i => i.severity === 'HIGH').length} High</span>
                      <span className="px-2 py-1 bg-yellow-500/20 text-yellow-400 rounded">{results.issues.filter(i => i.severity === 'MEDIUM').length} Medium</span>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {results.issues.map((issue) => (
                      <div key={issue.id} className={`p-4 rounded-xl border ${severityColors[issue.severity]}`}>
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <span className={`px-2 py-0.5 rounded text-xs font-medium ${issue.severity === 'CRITICAL' ? 'bg-red-500 text-white' :
                                issue.severity === 'HIGH' ? 'bg-orange-500 text-white' :
                                  issue.severity === 'MEDIUM' ? 'bg-yellow-500 text-black' :
                                    'bg-blue-500 text-white'
                                }`}>{issue.severity}</span>
                              <span className="text-xs text-slate-500 uppercase">{issue.category}</span>
                              {issue.needsRfi && (
                                <span className="px-2 py-0.5 bg-purple-500/20 text-purple-400 rounded text-xs">RFI Required</span>
                              )}
                            </div>
                            <p className="font-medium mb-1">{issue.description}</p>
                            <p className="text-sm opacity-75">{issue.impact}</p>
                            <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
                              {issue.sheetRef && <span>Sheet: {issue.sheetRef}</span>}
                              {issue.specRef && <span>Spec: {issue.specRef}</span>}
                            </div>
                          </div>
                          <AlertCircle className="w-5 h-5 flex-shrink-0 opacity-50" />
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Assumptions */}
                  <div className="mt-8">
                    <h3 className="text-lg font-semibold mb-4">Assumptions</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-slate-500 border-b border-slate-800">
                            <th className="pb-3 font-medium">ID</th>
                            <th className="pb-3 font-medium">Category</th>
                            <th className="pb-3 font-medium">Assumption</th>
                            <th className="pb-3 font-medium">Confidence</th>
                            <th className="pb-3 font-medium">Impact</th>
                          </tr>
                        </thead>
                        <tbody>
                          {results.assumptions.map((a) => (
                            <tr key={a.id} className="border-b border-slate-800/30">
                              <td className="py-2.5 font-mono text-slate-500">{a.id}</td>
                              <td className="py-2.5 text-slate-400">{a.category}</td>
                              <td className="py-2.5">{a.description}</td>
                              <td className="py-2.5"><span className={`px-2 py-0.5 rounded text-xs ${a.confidence === 'HIGH' || a.confidence === 'SPEC' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700 text-slate-300'}`}>{a.confidence}</span></td>
                              <td className="py-2.5 text-slate-400">{a.impact}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* New Project Button */}
            <div className="flex justify-center pt-4">
              <button
                onClick={() => {
                  setCurrentStep(0);
                  setPlanFiles([]);
                  setSpecFiles([]);
                  setResults(null);
                  setProjectName('');
                }}
                className="flex items-center gap-2 px-6 py-3 bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors"
              >
                <Plus className="w-5 h-5" />
                Start New Project
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="relative border-t border-gold/30 mt-12">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <p className="text-center text-sm text-gold/50">
            3D Technology Services • LV Takeoff Intelligence • AI-Powered Low-Voltage Construction Estimation
          </p>
        </div>
      </footer>

      {/* Floor Plan Verification Overlay */}
      {showOverlay && (
        <FloorPlanOverlay
          imageUrl={planFiles[0] ? URL.createObjectURL(planFiles[0]) : null}
          imageName={planFiles[0]?.name || 'Floor Plan'}
          detectedDevices={detectedDevices}
          onClose={() => setShowOverlay(false)}
          onAnalyze={() => planFiles[0] && analyzeFloorPlanForMarking(planFiles[0])}
          pdfFile={planFiles[0]?.type === 'application/pdf' ? planFiles[0] : null}
        />
      )}

      {/* Password Modal for Edit Access */}
      {showPasswordModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 rounded-2xl border border-gold/30 p-6 w-full max-w-md">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 bg-gold/20 rounded-xl">
                <KeyRound className="w-6 h-6 text-gold" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">Enter Edit Password</h2>
                <p className="text-sm text-slate-400">Unlock editing capabilities</p>
              </div>
            </div>

            {passwordError && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg mb-4 text-red-400 text-sm">
                {passwordError}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-2">Password</label>
                <input
                  type="password"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      // Verify password
                      if (passwordInput === passwords.ops) {
                        setUserRole('ops');
                        setShowPasswordModal(null);
                        setPasswordInput('');
                        setPasswordError('');
                      } else if (passwordInput === passwords.pm) {
                        setUserRole('pm');
                        setShowPasswordModal(null);
                        setPasswordInput('');
                        setPasswordError('');
                      } else {
                        setPasswordError('Incorrect password');
                      }
                    }
                  }}
                  placeholder="Enter PM or Ops Manager password"
                  className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-gold/50 text-white"
                  autoFocus
                />
              </div>

              <div className="text-xs text-slate-500 p-3 bg-slate-800/50 rounded-lg">
                <p className="font-medium text-slate-400 mb-1">Access Levels:</p>
                <p>• <span className="text-cyan-400">PM Password</span> - Edit installed qty, labor hours, daily logs</p>
                <p>• <span className="text-amber-400">Ops Password</span> - Full access including password changes</p>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  setShowPasswordModal(null);
                  setPasswordInput('');
                  setPasswordError('');
                }}
                className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  // Verify password
                  if (passwordInput === passwords.ops) {
                    setUserRole('ops');
                    setShowPasswordModal(null);
                    setPasswordInput('');
                    setPasswordError('');
                  } else if (passwordInput === passwords.pm) {
                    setUserRole('pm');
                    setShowPasswordModal(null);
                    setPasswordInput('');
                    setPasswordError('');
                  } else {
                    setPasswordError('Incorrect password');
                  }
                }}
                className="flex items-center gap-2 px-5 py-2 bg-gold text-black font-medium rounded-lg hover:bg-gold/90 transition-colors"
              >
                <Unlock className="w-4 h-4" />
                Unlock
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
