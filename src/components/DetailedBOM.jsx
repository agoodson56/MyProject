import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Package, Wrench, Cable, Server, Building, DollarSign, Clock, Download, Upload, Edit3, X, Check } from 'lucide-react';

// Default labor rates ($/hr) - these are overridden by props from settings
const DEFAULT_LABOR_RATES = {
    technician: 65,
    leadTech: 85,
    projectManager: 95,
    apprentice: 45
};

// Industry standard labor distribution percentages for LV projects
const LABOR_DISTRIBUTION = {
    technician: 0.60,     // 60% - Hands-on installation work
    leadTech: 0.20,       // 20% - Supervision + complex work
    projectManager: 0.10, // 10% - Planning, coordination, closeout
    apprentice: 0.10      // 10% - Assistance, material handling
};

// Calculate blended labor rate based on position distribution
const calculateBlendedRate = (rates) => {
    return (rates.technician * LABOR_DISTRIBUTION.technician) +
        (rates.leadTech * LABOR_DISTRIBUTION.leadTech) +
        (rates.projectManager * LABOR_DISTRIBUTION.projectManager) +
        (rates.apprentice * LABOR_DISTRIBUTION.apprentice);
};

// Generate detailed BOM data with costs and labor
export function generateDetailedBOM(results) {
    const mdf = {
        name: 'MDF',
        type: 'MDF',
        floor: 'Level 1',
        buildout: {
            materials: [
                { item: '42U 4-Post Rack', qty: 2, unit: 'EA', unitCost: 1850, laborHrs: 4 },
                { item: 'Vertical Cable Manager', qty: 4, unit: 'EA', unitCost: 285, laborHrs: 0.5 },
                { item: 'Horizontal Cable Manager 2U', qty: 8, unit: 'EA', unitCost: 95, laborHrs: 0.25 },
                { item: 'Power Strip 20A', qty: 4, unit: 'EA', unitCost: 245, laborHrs: 0.5 },
                { item: 'Ground Bar Kit', qty: 2, unit: 'EA', unitCost: 125, laborHrs: 1 },
                { item: 'Ladder Rack 12"', qty: 24, unit: 'FT', unitCost: 18, laborHrs: 0.1 },
                { item: 'Basket Tray 12"', qty: 50, unit: 'FT', unitCost: 12, laborHrs: 0.08 }
            ]
        },
        deviceMaterial: {
            materials: [
                // Patch Panels
                { item: '48-Port CAT6A Patch Panel (Panduit CP48BLY)', qty: 4, unit: 'EA', unitCost: 385, laborHrs: 1.5 },
                { item: '24-Port CAT6A Patch Panel (Panduit CP24BLY)', qty: 2, unit: 'EA', unitCost: 225, laborHrs: 1 },
                // Fiber Enclosures & Housing
                { item: 'Fiber Enclosure 1U Rack Mount (Corning CCH-01U)', qty: 2, unit: 'EA', unitCost: 245, laborHrs: 0.5 },
                { item: 'LC Duplex Adapter Panel 6-Pack (Corning CCH-CP06-A9)', qty: 6, unit: 'EA', unitCost: 85, laborHrs: 0.25 },
                { item: 'Blank Adapter Panel (Corning CCH-CP06-BL)', qty: 2, unit: 'EA', unitCost: 15, laborHrs: 0.1 },
                { item: 'Fiber Cassette Tray (Corning CCH-CS24)', qty: 2, unit: 'EA', unitCost: 125, laborHrs: 0.25 },
                // Network Equipment
                { item: 'Network Switch 48-Port PoE+ (Cisco CBS350-48FP)', qty: 2, unit: 'EA', unitCost: 2850, laborHrs: 1 },
                { item: 'UPS 3000VA Rack Mount (APC SMT3000RM2U)', qty: 1, unit: 'EA', unitCost: 1650, laborHrs: 2 },
                // Cable Management
                { item: 'Fiber Slack Storage Spool', qty: 4, unit: 'EA', unitCost: 18, laborHrs: 0.1 }
            ]
        },
        terminations: {
            materials: [
                // CAT6A Jacks (Workstation Side)
                { item: 'CAT6A Jack Blue (Panduit CJ6X88TGBU)', qty: 192, unit: 'EA', unitCost: 12.50, laborHrs: 0.15 },
                { item: 'CAT6A Jack White (Panduit CJ6X88TGWH)', qty: 96, unit: 'EA', unitCost: 12.50, laborHrs: 0.15 },
                // Patch Panel Terminations (MDF Side) - included in panel install
                // Fiber Connectors
                { item: 'LC Connector OM4 (Corning 95-050-99-X)', qty: 48, unit: 'EA', unitCost: 14.50, laborHrs: 0.25 },
                { item: 'SC Connector OM4 (Corning 95-200-99)', qty: 12, unit: 'EA', unitCost: 12, laborHrs: 0.25 },
                // Patch Cords - Copper
                { item: 'CAT6A Patch Cord 3ft Blue (Panduit UTP6AX3BU)', qty: 144, unit: 'EA', unitCost: 8.50, laborHrs: 0.02 },
                { item: 'CAT6A Patch Cord 7ft Blue (Panduit UTP6AX7BU)', qty: 48, unit: 'EA', unitCost: 12, laborHrs: 0.02 },
                { item: 'CAT6A Patch Cord 3ft White (Panduit UTP6AX3WH)', qty: 48, unit: 'EA', unitCost: 8.50, laborHrs: 0.02 },
                // Patch Cords - Fiber
                { item: 'OM4 LC-LC Duplex Patch Cord 3m (Corning 002318G8120003M)', qty: 24, unit: 'EA', unitCost: 28, laborHrs: 0.05 },
                { item: 'OM4 LC-LC Duplex Patch Cord 5m (Corning 002318G8120005M)', qty: 12, unit: 'EA', unitCost: 35, laborHrs: 0.05 },
                // Faceplates & Surface Boxes
                { item: 'Faceplate 2-Port White (Panduit CFPE2WHY)', qty: 96, unit: 'EA', unitCost: 3.25, laborHrs: 0.05 },
                { item: 'Faceplate 1-Port White (Panduit CFPE1WHY)', qty: 48, unit: 'EA', unitCost: 2.50, laborHrs: 0.05 },
                { item: 'Surface Mount Box 2-Port (Panduit CBX2WH-A)', qty: 24, unit: 'EA', unitCost: 8, laborHrs: 0.1 }
            ]
        },
        cableRuns: {
            materials: [
                { item: 'CAT6A Plenum Blue', qty: 18500, unit: 'FT', unitCost: 0.42, laborHrs: 0.008 },
                { item: 'CAT6A Plenum White', qty: 6200, unit: 'FT', unitCost: 0.42, laborHrs: 0.008 },
                { item: 'J-Hook 2"', qty: 2200, unit: 'EA', unitCost: 2.15, laborHrs: 0.05 },
                { item: 'Velcro Strap Roll', qty: 8, unit: 'ROLL', unitCost: 28, laborHrs: 0 },
                { item: 'Cable Labels', qty: 300, unit: 'EA', unitCost: 0.35, laborHrs: 0.02 }
            ]
        },
        deviceInstall: {
            materials: [
                { item: 'Data Outlet Box', qty: 96, unit: 'EA', unitCost: 4.50, laborHrs: 0.15 },
                { item: 'Faceplate 2-Port', qty: 48, unit: 'EA', unitCost: 2.25, laborHrs: 0.05 },
                { item: 'Faceplate 1-Port', qty: 48, unit: 'EA', unitCost: 1.85, laborHrs: 0.05 },
                { item: 'WAP Mounting Bracket', qty: 12, unit: 'EA', unitCost: 35, laborHrs: 0.5 }
            ]
        },
        backbone: {
            materials: [
                // Fiber Cable
                { item: 'OM4 Fiber 12-Strand (to IDF-1)', qty: 150, unit: 'FT', unitCost: 2.85, laborHrs: 0.02 },
                { item: 'OM4 Fiber 12-Strand (to IDF-2)', qty: 250, unit: 'FT', unitCost: 2.85, laborHrs: 0.02 },
                { item: 'OM4 Fiber 12-Strand (to IDF-3)', qty: 350, unit: 'FT', unitCost: 2.85, laborHrs: 0.02 },
                // Fiber Termination at MDF
                { item: 'LC Duplex Connector (MDF side)', qty: 36, unit: 'EA', unitCost: 12.50, laborHrs: 0.25 },
                { item: 'Fiber Fusion Splice', qty: 36, unit: 'EA', unitCost: 8, laborHrs: 0.3 },
                { item: 'Fiber Splice Tray (MDF)', qty: 3, unit: 'EA', unitCost: 45, laborHrs: 0.5 },
                { item: 'Fiber Patch Cord OM4 LC-LC 3m', qty: 36, unit: 'EA', unitCost: 18, laborHrs: 0.05 },
                // Fiber Pathway
                { item: 'Innerduct 1" Orange', qty: 200, unit: 'FT', unitCost: 0.85, laborHrs: 0.03 },
                { item: 'Fiber Pull Tape', qty: 1, unit: 'ROLL', unitCost: 65, laborHrs: 0 },
                // Voice Backbone
                { item: '25-Pair CAT3 Riser (to IDF-1)', qty: 100, unit: 'FT', unitCost: 1.45, laborHrs: 0.015 },
                { item: '25-Pair CAT3 Riser (to IDF-2)', qty: 175, unit: 'FT', unitCost: 1.45, laborHrs: 0.015 },
                { item: '25-Pair CAT3 Riser (to IDF-3)', qty: 250, unit: 'FT', unitCost: 1.45, laborHrs: 0.015 },
                // Firestopping
                { item: 'Firestop Putty Pad', qty: 6, unit: 'EA', unitCost: 28, laborHrs: 0.5 },
                { item: 'Firestop Caulk', qty: 4, unit: 'TUBE', unitCost: 18, laborHrs: 0.25 }
            ]
        }
    };

    const idfs = [
        { name: 'IDF-1', floor: 'Level 1', deviceCount: 62 },
        { name: 'IDF-2', floor: 'Level 2', deviceCount: 84 },
        { name: 'IDF-3', floor: 'Level 3', deviceCount: 68 }
    ].map((idf, idx) => ({
        ...idf,
        type: 'IDF',
        buildout: {
            materials: [
                { item: '2-Post Relay Rack 7ft', qty: 1, unit: 'EA', unitCost: 425, laborHrs: 2 },
                { item: 'Vertical Cable Manager', qty: 2, unit: 'EA', unitCost: 185, laborHrs: 0.5 },
                { item: 'Horizontal Cable Manager 1U', qty: 4, unit: 'EA', unitCost: 65, laborHrs: 0.2 },
                { item: 'Power Strip 15A', qty: 2, unit: 'EA', unitCost: 125, laborHrs: 0.25 },
                { item: 'Ground Bar', qty: 1, unit: 'EA', unitCost: 85, laborHrs: 0.5 },
                { item: 'Basket Tray 12"', qty: 20, unit: 'FT', unitCost: 12, laborHrs: 0.08 }
            ]
        },
        deviceMaterial: {
            materials: [
                // Patch Panels
                { item: '48-Port CAT6A Patch Panel (Panduit CP48BLY)', qty: Math.ceil(idf.deviceCount / 48), unit: 'EA', unitCost: 385, laborHrs: 1.5 },
                { item: '24-Port CAT6A Patch Panel (Panduit CP24BLY)', qty: idf.deviceCount % 48 > 24 ? 0 : 1, unit: 'EA', unitCost: 225, laborHrs: 1 },
                // Fiber Enclosures & Housing
                { item: 'Fiber Enclosure 1U Rack Mount (Corning CCH-01U)', qty: 1, unit: 'EA', unitCost: 245, laborHrs: 0.5 },
                { item: 'LC Duplex Adapter Panel 6-Pack (Corning CCH-CP06-A9)', qty: 2, unit: 'EA', unitCost: 85, laborHrs: 0.25 },
                { item: 'Fiber Cassette Tray (Corning CCH-CS24)', qty: 1, unit: 'EA', unitCost: 125, laborHrs: 0.25 },
                // Network Equipment
                { item: 'Network Switch 48-Port PoE+ (Cisco CBS350-48FP)', qty: Math.ceil(idf.deviceCount / 48), unit: 'EA', unitCost: 2850, laborHrs: 1 },
                { item: 'Fiber Slack Storage Spool', qty: 2, unit: 'EA', unitCost: 18, laborHrs: 0.1 }
            ]
        },
        terminations: {
            materials: [
                // CAT6A Jacks (Workstation Side)
                { item: 'CAT6A Jack Blue (Panduit CJ6X88TGBU)', qty: Math.floor(idf.deviceCount * 0.7), unit: 'EA', unitCost: 12.50, laborHrs: 0.15 },
                { item: 'CAT6A Jack White (Panduit CJ6X88TGWH)', qty: Math.floor(idf.deviceCount * 0.3), unit: 'EA', unitCost: 12.50, laborHrs: 0.15 },
                // Fiber Connectors
                { item: 'LC Connector OM4 (Corning 95-050-99-X)', qty: 12, unit: 'EA', unitCost: 14.50, laborHrs: 0.25 },
                // Patch Cords - Copper
                { item: 'CAT6A Patch Cord 3ft Blue (Panduit UTP6AX3BU)', qty: Math.floor(idf.deviceCount * 0.7), unit: 'EA', unitCost: 8.50, laborHrs: 0.02 },
                { item: 'CAT6A Patch Cord 7ft Blue (Panduit UTP6AX7BU)', qty: Math.ceil(idf.deviceCount * 0.15), unit: 'EA', unitCost: 12, laborHrs: 0.02 },
                { item: 'CAT6A Patch Cord 3ft White (Panduit UTP6AX3WH)', qty: Math.floor(idf.deviceCount * 0.3), unit: 'EA', unitCost: 8.50, laborHrs: 0.02 },
                // Patch Cords - Fiber
                { item: 'OM4 LC-LC Duplex Patch Cord 2m (Corning 002318G8120002M)', qty: 12, unit: 'EA', unitCost: 24, laborHrs: 0.05 },
                // Faceplates
                { item: 'Faceplate 2-Port White (Panduit CFPE2WHY)', qty: Math.floor(idf.deviceCount / 2), unit: 'EA', unitCost: 3.25, laborHrs: 0.05 },
                { item: 'Faceplate 1-Port White (Panduit CFPE1WHY)', qty: Math.ceil(idf.deviceCount * 0.1), unit: 'EA', unitCost: 2.50, laborHrs: 0.05 },
                { item: 'Surface Mount Box 2-Port (Panduit CBX2WH-A)', qty: Math.ceil(idf.deviceCount * 0.1), unit: 'EA', unitCost: 8, laborHrs: 0.1 }
            ]
        },
        cableRuns: {
            materials: [
                { item: 'CAT6A Plenum Blue', qty: Math.floor(idf.deviceCount * 0.7) * 150, unit: 'FT', unitCost: 0.42, laborHrs: 0.008 },
                { item: 'CAT6A Plenum White', qty: Math.floor(idf.deviceCount * 0.3) * 150, unit: 'FT', unitCost: 0.42, laborHrs: 0.008 },
                { item: 'J-Hook 2"', qty: Math.ceil((idf.deviceCount * 150) / 8), unit: 'EA', unitCost: 2.15, laborHrs: 0.05 },
                { item: 'Cable Labels', qty: idf.deviceCount * 2, unit: 'EA', unitCost: 0.35, laborHrs: 0.02 }
            ]
        },
        deviceInstall: {
            materials: [
                { item: 'Data Outlet Box', qty: idf.deviceCount, unit: 'EA', unitCost: 4.50, laborHrs: 0.15 },
                { item: 'Faceplate 2-Port', qty: Math.floor(idf.deviceCount / 2), unit: 'EA', unitCost: 2.25, laborHrs: 0.05 },
                { item: 'WAP Mounting Bracket', qty: Math.ceil(idf.deviceCount * 0.1), unit: 'EA', unitCost: 35, laborHrs: 0.5 }
            ]
        },
        backboneReceive: {
            materials: [
                // Fiber Termination at IDF
                { item: 'LC Duplex Connector (IDF side)', qty: 12, unit: 'EA', unitCost: 12.50, laborHrs: 0.25 },
                { item: 'Fiber Fusion Splice', qty: 12, unit: 'EA', unitCost: 8, laborHrs: 0.3 },
                { item: 'LC Fiber Pigtail OM4', qty: 12, unit: 'EA', unitCost: 8.50, laborHrs: 0.2 },
                { item: 'Fiber Splice Tray', qty: 1, unit: 'EA', unitCost: 45, laborHrs: 0.5 },
                { item: 'Fiber Patch Cord OM4 LC-LC 2m', qty: 12, unit: 'EA', unitCost: 15, laborHrs: 0.05 },
                // Fiber Enclosure (already in deviceMaterial, but termination labor here)
                { item: 'Fiber Enclosure Mounting', qty: 1, unit: 'EA', unitCost: 0, laborHrs: 1 },
                // Voice Backbone Termination
                { item: '66 Block (Voice)', qty: 2, unit: 'EA', unitCost: 35, laborHrs: 0.75 },
                { item: '66 Block Connecting Block', qty: 4, unit: 'EA', unitCost: 12, laborHrs: 0.15 },
                { item: '66 Block Mounting Bracket', qty: 1, unit: 'EA', unitCost: 18, laborHrs: 0.25 }
            ]
        }
    }));

    return { mdf, idfs };
}

// Calculate totals for a section
function calcSectionTotals(materials) {
    return materials.reduce((acc, m) => ({
        materialCost: acc.materialCost + (m.qty * m.unitCost),
        laborHours: acc.laborHours + (m.qty * m.laborHrs)
    }), { materialCost: 0, laborHours: 0 });
}

// Section component
function BOMSection({ title, icon: Icon, materials, color, sectionKey, closetName, customPrices, canEdit, onEditPrice, editingItem, editPrice, onEditPriceChange, onSavePrice, onCancelEdit, onClearCustomPrice }) {
    const [expanded, setExpanded] = useState(false);
    const totals = calcSectionTotals(materials);

    const isEditing = (item) => editingItem?.closet === closetName && editingItem?.section === sectionKey && editingItem?.item === item;

    return (
        <div className="border border-slate-700/50 rounded-xl overflow-hidden">
            <button
                onClick={() => setExpanded(!expanded)}
                className="w-full flex items-center justify-between p-4 bg-slate-800/30 hover:bg-slate-800/50 transition-colors"
            >
                <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg bg-${color}-500/20 flex items-center justify-center`}>
                        <Icon className={`w-4 h-4 text-${color}-400`} />
                    </div>
                    <span className="font-medium text-white">{title}</span>
                </div>
                <div className="flex items-center gap-6">
                    <div className="text-right">
                        <div className="flex items-center gap-1 text-sm text-emerald-400">
                            <DollarSign className="w-3 h-3" />
                            {totals.materialCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                    </div>
                    <div className="text-right">
                        <div className="flex items-center gap-1 text-sm text-cyan-400">
                            <Clock className="w-3 h-3" />
                            {totals.laborHours.toFixed(1)} hrs
                        </div>
                    </div>
                    {expanded ? <ChevronDown className="w-4 h-4 text-white" /> : <ChevronRight className="w-4 h-4 text-white" />}
                </div>
            </button>

            {expanded && (
                <div className="p-4 bg-slate-900/30">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-white border-b border-slate-800">
                                <th className="text-left pb-2 font-medium">Item</th>
                                <th className="text-right pb-2 font-medium">Qty</th>
                                <th className="text-center pb-2 font-medium">Unit</th>
                                <th className="text-right pb-2 font-medium">Unit $ <Edit3 className="w-3 h-3 inline text-slate-500" /></th>
                                <th className="text-right pb-2 font-medium">Ext $</th>
                                <th className="text-right pb-2 font-medium">Labor/Unit</th>
                                <th className="text-right pb-2 font-medium">Total Hrs</th>
                            </tr>
                        </thead>
                        <tbody>
                            {materials.map((m, i) => {
                                const priceKey = `${closetName}-${sectionKey}-${m.item}`;
                                const hasCustom = m.hasCustomPrice;
                                return (
                                    <tr key={i} className="border-b border-slate-800/30 hover:bg-slate-800/20">
                                        <td className="py-2 text-white">{m.item}</td>
                                        <td className="py-2 text-right text-white">{m.qty.toLocaleString()}</td>
                                        <td className="py-2 text-center text-white">{m.unit}</td>
                                        <td className="py-2 text-right">
                                            {isEditing(m.item) ? (
                                                <div className="flex items-center justify-end gap-1">
                                                    <span className="text-white">$</span>
                                                    <input
                                                        type="number"
                                                        step="0.01"
                                                        value={editPrice}
                                                        onChange={(e) => onEditPriceChange(e.target.value)}
                                                        className="w-20 px-2 py-1 bg-slate-800 border border-cyan-500/50 rounded text-right text-white text-sm focus:outline-none"
                                                        autoFocus
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') onSavePrice();
                                                            if (e.key === 'Escape') onCancelEdit();
                                                        }}
                                                    />
                                                    <button onClick={onSavePrice} className="p-1 text-emerald-400 hover:text-emerald-300">
                                                        <Check className="w-4 h-4" />
                                                    </button>
                                                    <button onClick={onCancelEdit} className="p-1 text-red-400 hover:text-red-300">
                                                        <X className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            ) : canEdit ? (
                                                <button
                                                    onClick={() => onEditPrice(sectionKey, m.item, m.unitCost)}
                                                    className={`flex items-center justify-end gap-1 hover:text-cyan-400 transition-colors ${hasCustom ? 'text-amber-400' : 'text-white'}`}
                                                    title={hasCustom ? 'Custom price applied - click to edit' : 'Click to edit'}
                                                >
                                                    ${m.unitCost.toFixed(2)}
                                                    {hasCustom && (
                                                        <span
                                                            onClick={(e) => { e.stopPropagation(); onClearCustomPrice(priceKey); }}
                                                            className="text-xs text-red-400 hover:text-red-300 ml-1"
                                                            title="Remove custom price"
                                                        >✕</span>
                                                    )}
                                                </button>
                                            ) : (
                                                <span className={hasCustom ? 'text-amber-400' : 'text-white'}>
                                                    ${m.unitCost.toFixed(2)}
                                                    {hasCustom && <span className="text-xs text-amber-500 ml-1">★</span>}
                                                </span>
                                            )}
                                        </td>
                                        <td className="py-2 text-right text-emerald-400">${(m.qty * m.unitCost).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                                        <td className="py-2 text-right text-white">{m.laborHrs}h</td>
                                        <td className="py-2 text-right text-cyan-400">{(m.qty * m.laborHrs).toFixed(1)}h</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                        <tfoot>
                            <tr className="font-semibold border-t border-slate-700">
                                <td colSpan="4" className="pt-3 text-right text-white">Section Totals:</td>
                                <td className="pt-3 text-right text-emerald-400">${totals.materialCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                                <td></td>
                                <td className="pt-3 text-right text-cyan-400">{totals.laborHours.toFixed(1)}h</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            )}
        </div>
    );
}

// Closet Card
function ClosetCard({ closet, isExpanded, onToggle, customPrices, canEdit, onEditPrice, editingItem, editPrice, onEditPriceChange, onSavePrice, onCancelEdit, onClearCustomPrice }) {
    const sections = [
        { key: 'buildout', title: 'Closet Buildout', icon: Building, color: 'purple' },
        { key: 'deviceMaterial', title: 'Device Material (Closet)', icon: Server, color: 'blue' },
        { key: 'terminations', title: 'Terminations', icon: Wrench, color: 'orange' },
        { key: 'cableRuns', title: 'Cable Runs & Pathway', icon: Cable, color: 'cyan' },
        { key: 'deviceInstall', title: 'Device Installation', icon: Package, color: 'emerald' },
        {
            key: closet.type === 'MDF' ? 'backbone' : 'backboneReceive',
            title: closet.type === 'MDF' ? 'Backbone (to IDFs)' : 'Backbone (from MDF)',
            icon: Cable, color: 'red'
        }
    ];

    const allMaterials = sections.flatMap(s => closet[s.key]?.materials || []);
    const totals = calcSectionTotals(allMaterials);
    const laborCost = totals.laborHours * calculateBlendedRate(DEFAULT_LABOR_RATES);

    return (
        <div className="bg-slate-900/50 rounded-2xl border border-slate-800/50 overflow-hidden">
            <button
                onClick={onToggle}
                className="w-full p-5 flex items-center justify-between hover:bg-slate-800/30 transition-colors"
            >
                <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${closet.type === 'MDF'
                        ? 'bg-gradient-to-br from-cyan-500 to-blue-600'
                        : 'bg-gradient-to-br from-purple-500 to-indigo-600'
                        }`}>
                        <Server className="w-6 h-6 text-white" />
                    </div>
                    <div className="text-left">
                        <h3 className="text-lg font-bold text-slate-800">{closet.name}</h3>
                        <p className="text-sm text-slate-600">{closet.floor} • {closet.type}</p>
                    </div>
                </div>
                <div className="flex items-center gap-8">
                    <div className="text-right">
                        <p className="text-xs text-slate-600 font-semibold">Material</p>
                        <p className="text-lg font-bold text-emerald-600">${totals.materialCost.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</p>
                    </div>
                    <div className="text-right">
                        <p className="text-xs text-slate-600 font-semibold">Labor Hrs</p>
                        <p className="text-lg font-bold text-cyan-600">{totals.laborHours.toFixed(0)}h</p>
                    </div>
                    <div className="text-right">
                        <p className="text-xs text-slate-600 font-semibold">Labor Cost</p>
                        <p className="text-lg font-bold text-amber-600">${laborCost.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</p>
                    </div>
                    {isExpanded ? <ChevronDown className="w-5 h-5 text-slate-600" /> : <ChevronRight className="w-5 h-5 text-slate-600" />}
                </div>
            </button>

            {isExpanded && (
                <div className="p-5 pt-0 space-y-3">
                    {sections.map(s => closet[s.key]?.materials && (
                        <BOMSection
                            key={s.key}
                            sectionKey={s.key}
                            closetName={closet.name}
                            title={s.title}
                            icon={s.icon}
                            materials={closet[s.key].materials}
                            color={s.color}
                            customPrices={customPrices}
                            canEdit={canEdit}
                            onEditPrice={onEditPrice}
                            editingItem={editingItem}
                            editPrice={editPrice}
                            onEditPriceChange={onEditPriceChange}
                            onSavePrice={onSavePrice}
                            onCancelEdit={onCancelEdit}
                            onClearCustomPrice={onClearCustomPrice}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

export default function DetailedBOM({ results, canEdit = true, laborRates = null }) {
    // Use passed rates or defaults
    const rates = laborRates || DEFAULT_LABOR_RATES;
    const blendedRate = calculateBlendedRate(rates);
    const [expandedCloset, setExpandedCloset] = useState('MDF');
    const [customPrices, setCustomPrices] = useState({});
    const [showUploadModal, setShowUploadModal] = useState(false);
    const [editingItem, setEditingItem] = useState(null);
    const [editPrice, setEditPrice] = useState('');
    const fileInputRef = React.useRef(null);

    const bomData = generateDetailedBOM(results);

    // Apply custom prices to BOM data
    const applyCustomPrices = (closets) => {
        return closets.map(closet => {
            const sections = ['buildout', 'deviceMaterial', 'terminations', 'cableRuns', 'deviceInstall', 'backbone', 'backboneReceive'];
            const updated = { ...closet };
            sections.forEach(s => {
                if (updated[s]?.materials) {
                    updated[s] = {
                        ...updated[s],
                        materials: updated[s].materials.map(m => {
                            const key = `${closet.name}-${s}-${m.item}`;
                            return customPrices[key] !== undefined
                                ? { ...m, unitCost: customPrices[key], hasCustomPrice: true }
                                : m;
                        })
                    };
                }
            });
            return updated;
        });
    };

    const allClosets = applyCustomPrices([bomData.mdf, ...bomData.idfs]);

    // Calculate grand totals with custom prices
    const grandTotals = allClosets.reduce((acc, closet) => {
        const sections = ['buildout', 'deviceMaterial', 'terminations', 'cableRuns', 'deviceInstall', 'backbone', 'backboneReceive'];
        sections.forEach(s => {
            if (closet[s]?.materials) {
                const t = calcSectionTotals(closet[s].materials);
                acc.materialCost += t.materialCost;
                acc.laborHours += t.laborHours;
            }
        });
        return acc;
    }, { materialCost: 0, laborHours: 0 });

    // Generate flat BOM list for export
    const generateFlatBOM = () => {
        const rows = [];
        allClosets.forEach(closet => {
            const sections = ['buildout', 'deviceMaterial', 'terminations', 'cableRuns', 'deviceInstall', 'backbone', 'backboneReceive'];
            sections.forEach(s => {
                if (closet[s]?.materials) {
                    closet[s].materials.forEach(m => {
                        rows.push({
                            Closet: closet.name,
                            Section: s,
                            Item: m.item,
                            Qty: m.qty,
                            Unit: m.unit,
                            UnitCost: m.unitCost,
                            ExtCost: m.qty * m.unitCost,
                            LaborHrs: m.laborHrs,
                            TotalLabor: m.qty * m.laborHrs
                        });
                    });
                }
            });
        });
        return rows;
    };

    // Download BOM as CSV
    const downloadBOM = () => {
        const rows = generateFlatBOM();
        const headers = ['Closet', 'Section', 'Item', 'Qty', 'Unit', 'UnitCost', 'ExtCost', 'LaborHrs', 'TotalLabor'];
        const csv = [
            headers.join(','),
            ...rows.map(r => headers.map(h => `"${r[h]}"`).join(','))
        ].join('\n');

        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `BOM_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    // Handle pricing CSV upload
    const handlePricingUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const text = event.target.result;
            const lines = text.split('\n');
            const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim());

            const itemIdx = headers.findIndex(h => h.toLowerCase().includes('item'));
            const priceIdx = headers.findIndex(h => h.toLowerCase().includes('unitcost') || h.toLowerCase().includes('price'));
            const closetIdx = headers.findIndex(h => h.toLowerCase().includes('closet'));
            const sectionIdx = headers.findIndex(h => h.toLowerCase().includes('section'));

            if (itemIdx === -1 || priceIdx === -1) {
                alert('CSV must have Item and UnitCost/Price columns');
                return;
            }

            const newPrices = { ...customPrices };
            for (let i = 1; i < lines.length; i++) {
                const cols = lines[i].split(',').map(c => c.replace(/"/g, '').trim());
                if (cols.length > Math.max(itemIdx, priceIdx)) {
                    const item = cols[itemIdx];
                    const price = parseFloat(cols[priceIdx]);
                    const closet = closetIdx !== -1 ? cols[closetIdx] : '';
                    const section = sectionIdx !== -1 ? cols[sectionIdx] : '';

                    if (!isNaN(price) && item) {
                        // Try to match with closet/section if available
                        if (closet && section) {
                            newPrices[`${closet}-${section}-${item}`] = price;
                        } else {
                            // Apply to all matching items
                            allClosets.forEach(c => {
                                const sections = ['buildout', 'deviceMaterial', 'terminations', 'cableRuns', 'deviceInstall', 'backbone', 'backboneReceive'];
                                sections.forEach(s => {
                                    if (c[s]?.materials) {
                                        c[s].materials.forEach(m => {
                                            if (m.item === item || m.item.includes(item)) {
                                                newPrices[`${c.name}-${s}-${m.item}`] = price;
                                            }
                                        });
                                    }
                                });
                            });
                        }
                    }
                }
            }
            setCustomPrices(newPrices);
            setShowUploadModal(false);
        };
        reader.readAsText(file);
    };

    // Handle manual price edit
    const handleSavePrice = (closetName, section, itemName) => {
        const price = parseFloat(editPrice);
        if (!isNaN(price) && price >= 0) {
            setCustomPrices(prev => ({
                ...prev,
                [`${closetName}-${section}-${itemName}`]: price
            }));
        }
        setEditingItem(null);
        setEditPrice('');
    };

    // Clear custom price
    const clearCustomPrice = (key) => {
        setCustomPrices(prev => {
            const updated = { ...prev };
            delete updated[key];
            return updated;
        });
    };

    return (
        <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-4 gap-4">
                <div className="p-5 bg-slate-900/50 rounded-2xl border border-slate-800/50">
                    <p className="text-sm text-white mb-1">Total Material</p>
                    <p className="text-2xl font-bold text-emerald-400">${grandTotals.materialCost.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</p>
                </div>
                <div className="p-5 bg-slate-900/50 rounded-2xl border border-slate-800/50">
                    <p className="text-sm text-white mb-1">Total Labor Hours</p>
                    <p className="text-2xl font-bold text-cyan-400">{grandTotals.laborHours.toFixed(0)} hrs</p>
                </div>
                <div className="p-5 bg-slate-900/50 rounded-2xl border border-slate-800/50">
                    <p className="text-sm text-white mb-1">Labor Cost (@${blendedRate.toFixed(2)}/hr blended)</p>
                    <p className="text-2xl font-bold text-amber-400">${(grandTotals.laborHours * blendedRate).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</p>
                </div>
                <div className="p-5 bg-slate-900/50 rounded-2xl border border-slate-800/50">
                    <p className="text-sm text-white mb-1">Grand Total</p>
                    <p className="text-2xl font-bold text-white">${(grandTotals.materialCost + grandTotals.laborHours * blendedRate).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</p>
                </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <button
                        onClick={downloadBOM}
                        className="flex items-center gap-2 px-4 py-2 bg-emerald-500/20 text-emerald-400 rounded-lg hover:bg-emerald-500/30 transition-colors"
                    >
                        <Download className="w-4 h-4" />
                        Download BOM (CSV)
                    </button>
                    {canEdit && (
                        <button
                            onClick={() => setShowUploadModal(true)}
                            className="flex items-center gap-2 px-4 py-2 bg-cyan-500/20 text-cyan-400 rounded-lg hover:bg-cyan-500/30 transition-colors"
                        >
                            <Upload className="w-4 h-4" />
                            Upload Pricing
                        </button>
                    )}
                    {Object.keys(customPrices).length > 0 && (
                        <span className="text-sm text-amber-400">
                            {Object.keys(customPrices).length} custom price(s) applied
                        </span>
                    )}
                </div>
                {canEdit ? (
                    <p className="text-sm text-slate-400">
                        Click any unit cost to edit manually
                    </p>
                ) : (
                    <p className="text-sm text-amber-400">
                        🔒 View Only Mode - Estimator access required to edit
                    </p>
                )}
            </div>

            {/* Upload Modal */}
            {showUploadModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6 max-w-md w-full mx-4">
                        <h3 className="text-lg font-bold text-white mb-4">Upload Vendor Pricing</h3>
                        <p className="text-sm text-slate-400 mb-4">
                            Upload a CSV file with updated pricing. The file should have columns for Item and UnitCost/Price.
                            Optionally include Closet and Section for precise matching.
                        </p>
                        <div className="border-2 border-dashed border-slate-700 rounded-xl p-8 text-center mb-4">
                            <input
                                type="file"
                                accept=".csv"
                                onChange={handlePricingUpload}
                                className="hidden"
                                id="pricing-upload"
                            />
                            <label htmlFor="pricing-upload" className="cursor-pointer">
                                <Upload className="w-10 h-10 text-slate-500 mx-auto mb-2" />
                                <p className="text-white font-medium">Click to select CSV file</p>
                                <p className="text-sm text-slate-500">or drag and drop</p>
                            </label>
                        </div>
                        <div className="flex justify-end gap-2">
                            <button
                                onClick={() => setShowUploadModal(false)}
                                className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* MDF */}
            <ClosetCard
                closet={allClosets[0]}
                isExpanded={expandedCloset === 'MDF'}
                onToggle={() => setExpandedCloset(expandedCloset === 'MDF' ? null : 'MDF')}
                customPrices={customPrices}
                canEdit={canEdit}
                onEditPrice={(section, item, currentPrice) => {
                    if (!canEdit) return;
                    setEditingItem({ closet: 'MDF', section, item });
                    setEditPrice(currentPrice.toString());
                }}
                editingItem={editingItem}
                editPrice={editPrice}
                onEditPriceChange={setEditPrice}
                onSavePrice={() => handleSavePrice(editingItem.closet, editingItem.section, editingItem.item)}
                onCancelEdit={() => { setEditingItem(null); setEditPrice(''); }}
                onClearCustomPrice={clearCustomPrice}
            />

            {/* IDFs */}
            <div className="space-y-4">
                <h3 className="text-lg font-semibold text-white">IDF Closets</h3>
                {allClosets.slice(1).map(idf => (
                    <ClosetCard
                        key={idf.name}
                        closet={idf}
                        isExpanded={expandedCloset === idf.name}
                        onToggle={() => setExpandedCloset(expandedCloset === idf.name ? null : idf.name)}
                        customPrices={customPrices}
                        canEdit={canEdit}
                        onEditPrice={(section, item, currentPrice) => {
                            if (!canEdit) return;
                            setEditingItem({ closet: idf.name, section, item });
                            setEditPrice(currentPrice.toString());
                        }}
                        editingItem={editingItem}
                        editPrice={editPrice}
                        onEditPriceChange={setEditPrice}
                        onSavePrice={() => handleSavePrice(editingItem.closet, editingItem.section, editingItem.item)}
                        onCancelEdit={() => { setEditingItem(null); setEditPrice(''); }}
                        onClearCustomPrice={clearCustomPrice}
                    />
                ))}
            </div>
        </div>
    );
}
