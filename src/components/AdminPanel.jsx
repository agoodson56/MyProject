import React, { useState, useEffect } from 'react';
import { Shield, Trash2, Key, RefreshCw, Eye, EyeOff, LogOut, Save, AlertTriangle, Settings } from 'lucide-react';

// Default admin password - stored in localStorage after first change
const DEFAULT_ADMIN_PASSWORD = 'Admin3DTSI2026!';

export default function AdminPanel() {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [masterPassword, setMasterPassword] = useState('');
    const [authError, setAuthError] = useState('');
    const [projects, setProjects] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [showPasswords, setShowPasswords] = useState({});
    const [editingProject, setEditingProject] = useState(null);
    const [saving, setSaving] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState(null);

    // Admin password change state
    const [showAdminSettings, setShowAdminSettings] = useState(false);
    const [newAdminPassword, setNewAdminPassword] = useState('');
    const [confirmAdminPassword, setConfirmAdminPassword] = useState('');
    const [adminPasswordError, setAdminPasswordError] = useState('');
    const [adminPasswordSuccess, setAdminPasswordSuccess] = useState('');

    // Get stored admin password or use default
    const getAdminPassword = () => {
        return localStorage.getItem('adminPassword') || DEFAULT_ADMIN_PASSWORD;
    };

    const handleLogin = () => {
        if (masterPassword === getAdminPassword()) {
            setIsAuthenticated(true);
            setAuthError('');
            loadProjects();
        } else {
            setAuthError('Invalid admin password');
        }
    };

    const handleChangeAdminPassword = () => {
        setAdminPasswordError('');
        setAdminPasswordSuccess('');

        if (newAdminPassword.length < 8) {
            setAdminPasswordError('Password must be at least 8 characters');
            return;
        }

        if (newAdminPassword !== confirmAdminPassword) {
            setAdminPasswordError('Passwords do not match');
            return;
        }

        // Save new password to localStorage
        localStorage.setItem('adminPassword', newAdminPassword);
        setAdminPasswordSuccess('Admin password updated successfully!');
        setNewAdminPassword('');
        setConfirmAdminPassword('');

        // Hide success message after 3 seconds
        setTimeout(() => setAdminPasswordSuccess(''), 3000);
    };

    const loadProjects = async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await fetch('/api/admin/projects');
            if (!response.ok) throw new Error('Failed to load projects');
            const data = await response.json();
            setProjects(data);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleUpdatePassword = async (jobNumber, field, value) => {
        setSaving(true);
        try {
            const response = await fetch(`/api/projects?job_number=${jobNumber}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ [field]: value })
            });
            if (!response.ok) throw new Error('Failed to update password');
            loadProjects();
            setEditingProject(null);
        } catch (err) {
            alert('Error: ' + err.message);
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (jobNumber) => {
        try {
            const response = await fetch(`/api/projects?job_number=${jobNumber}`, {
                method: 'DELETE'
            });
            if (!response.ok) throw new Error('Failed to delete project');
            setDeleteConfirm(null);
            loadProjects();
        } catch (err) {
            alert('Error: ' + err.message);
        }
    };

    const generatePassword = () => {
        return Math.random().toString(36).substring(2, 8).toUpperCase();
    };

    if (!isAuthenticated) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-4">
                <div className="bg-slate-800/50 border border-red-500/30 rounded-2xl p-8 max-w-md w-full">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="w-12 h-12 rounded-xl bg-red-500/20 flex items-center justify-center">
                            <Shield className="w-6 h-6 text-red-400" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-white">Admin Access</h1>
                            <p className="text-slate-400 text-sm">Restricted Area</p>
                        </div>
                    </div>

                    <input
                        type="password"
                        value={masterPassword}
                        onChange={(e) => setMasterPassword(e.target.value)}
                        placeholder="Enter admin password..."
                        className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg text-white mb-3 focus:outline-none focus:ring-2 focus:ring-red-500/50"
                        onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                        autoFocus
                    />

                    {authError && <p className="text-red-400 text-sm mb-3">{authError}</p>}

                    <button
                        onClick={handleLogin}
                        className="w-full py-3 bg-red-600 hover:bg-red-500 text-white rounded-lg font-medium transition-colors"
                    >
                        Access Admin Panel
                    </button>

                    <p className="text-slate-500 text-xs text-center mt-4">
                        Unauthorized access is prohibited
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white p-8">
            <div className="max-w-6xl mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-red-500/20 flex items-center justify-center">
                            <Shield className="w-6 h-6 text-red-400" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-white">Admin Panel</h1>
                            <p className="text-slate-400">Manage projects and passwords</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setShowAdminSettings(!showAdminSettings)}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${showAdminSettings
                                    ? 'bg-cyan-600 text-white'
                                    : 'bg-slate-700 hover:bg-slate-600'
                                }`}
                        >
                            <Settings className="w-4 h-4" />
                            Settings
                        </button>
                        <button
                            onClick={loadProjects}
                            className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
                        >
                            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                            Refresh
                        </button>
                        <button
                            onClick={() => setIsAuthenticated(false)}
                            className="flex items-center gap-2 px-4 py-2 bg-red-600/20 border border-red-500/30 hover:bg-red-600/30 text-red-400 rounded-lg transition-colors"
                        >
                            <LogOut className="w-4 h-4" />
                            Logout
                        </button>
                    </div>
                </div>

                {/* Admin Password Settings Panel */}
                {showAdminSettings && (
                    <div className="bg-slate-800/50 border border-cyan-500/30 rounded-2xl p-6 mb-6">
                        <div className="flex items-center gap-3 mb-4">
                            <Settings className="w-5 h-5 text-cyan-400" />
                            <h2 className="text-lg font-semibold text-white">Change Admin Password</h2>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-xl">
                            <div>
                                <label className="block text-sm text-slate-400 mb-1">New Password</label>
                                <input
                                    type="password"
                                    value={newAdminPassword}
                                    onChange={(e) => setNewAdminPassword(e.target.value)}
                                    placeholder="Enter new password..."
                                    className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-slate-400 mb-1">Confirm Password</label>
                                <input
                                    type="password"
                                    value={confirmAdminPassword}
                                    onChange={(e) => setConfirmAdminPassword(e.target.value)}
                                    placeholder="Confirm new password..."
                                    className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                                    onKeyDown={(e) => e.key === 'Enter' && handleChangeAdminPassword()}
                                />
                            </div>
                        </div>

                        {adminPasswordError && (
                            <p className="text-red-400 text-sm mt-3">{adminPasswordError}</p>
                        )}
                        {adminPasswordSuccess && (
                            <p className="text-green-400 text-sm mt-3">{adminPasswordSuccess}</p>
                        )}

                        <button
                            onClick={handleChangeAdminPassword}
                            className="mt-4 px-6 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
                        >
                            <Key className="w-4 h-4" />
                            Update Password
                        </button>

                        <p className="text-slate-500 text-xs mt-3">
                            Password is stored locally in your browser. Min 8 characters required.
                        </p>
                    </div>
                )}

                {/* Error */}
                {error && (
                    <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-4 mb-6">
                        <p className="text-red-400">{error}</p>
                    </div>
                )}

                {/* Projects Table */}
                <div className="bg-slate-800/50 border border-slate-700 rounded-2xl overflow-hidden">
                    <div className="p-4 border-b border-slate-700">
                        <h2 className="text-lg font-semibold">All Projects ({projects.length})</h2>
                    </div>

                    {loading ? (
                        <div className="p-8 text-center text-slate-400">Loading...</div>
                    ) : projects.length === 0 ? (
                        <div className="p-8 text-center text-slate-400">No projects found</div>
                    ) : (
                        <table className="w-full">
                            <thead className="bg-slate-900/50">
                                <tr>
                                    <th className="text-left px-4 py-3 text-sm font-medium text-slate-400">Job #</th>
                                    <th className="text-left px-4 py-3 text-sm font-medium text-slate-400">Project Name</th>
                                    <th className="text-left px-4 py-3 text-sm font-medium text-slate-400">Client</th>
                                    <th className="text-left px-4 py-3 text-sm font-medium text-slate-400">PM Password</th>
                                    <th className="text-left px-4 py-3 text-sm font-medium text-slate-400">OPS Password</th>
                                    <th className="text-left px-4 py-3 text-sm font-medium text-slate-400">Created</th>
                                    <th className="text-right px-4 py-3 text-sm font-medium text-slate-400">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {projects.map((project) => (
                                    <tr key={project.job_number} className="border-t border-slate-700/50 hover:bg-slate-800/30">
                                        <td className="px-4 py-3 font-mono text-cyan-400">{project.job_number}</td>
                                        <td className="px-4 py-3">{project.project_name}</td>
                                        <td className="px-4 py-3 text-slate-400">{project.client_name || '-'}</td>

                                        {/* PM Password */}
                                        <td className="px-4 py-3">
                                            {editingProject === `${project.job_number}-pm` ? (
                                                <div className="flex items-center gap-2">
                                                    <input
                                                        type="text"
                                                        defaultValue={project.pm_password}
                                                        className="w-24 px-2 py-1 bg-slate-900 border border-slate-600 rounded text-sm"
                                                        id={`pm-${project.job_number}`}
                                                    />
                                                    <button
                                                        onClick={() => {
                                                            const input = document.getElementById(`pm-${project.job_number}`);
                                                            handleUpdatePassword(project.job_number, 'pm_password', input.value);
                                                        }}
                                                        className="p-1 bg-green-600 rounded hover:bg-green-500"
                                                        disabled={saving}
                                                    >
                                                        <Save className="w-3 h-3" />
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-2">
                                                    <span className={`font-mono ${showPasswords[`${project.job_number}-pm`] ? '' : 'blur-sm'}`}>
                                                        {project.pm_password || 'Not set'}
                                                    </span>
                                                    <button
                                                        onClick={() => setShowPasswords(p => ({ ...p, [`${project.job_number}-pm`]: !p[`${project.job_number}-pm`] }))}
                                                        className="p-1 text-slate-400 hover:text-white"
                                                    >
                                                        {showPasswords[`${project.job_number}-pm`] ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                                                    </button>
                                                    <button
                                                        onClick={() => setEditingProject(`${project.job_number}-pm`)}
                                                        className="p-1 text-slate-400 hover:text-cyan-400"
                                                    >
                                                        <Key className="w-3 h-3" />
                                                    </button>
                                                </div>
                                            )}
                                        </td>

                                        {/* OPS Password */}
                                        <td className="px-4 py-3">
                                            {editingProject === `${project.job_number}-ops` ? (
                                                <div className="flex items-center gap-2">
                                                    <input
                                                        type="text"
                                                        defaultValue={project.ops_password}
                                                        className="w-24 px-2 py-1 bg-slate-900 border border-slate-600 rounded text-sm"
                                                        id={`ops-${project.job_number}`}
                                                    />
                                                    <button
                                                        onClick={() => {
                                                            const input = document.getElementById(`ops-${project.job_number}`);
                                                            handleUpdatePassword(project.job_number, 'ops_password', input.value);
                                                        }}
                                                        className="p-1 bg-green-600 rounded hover:bg-green-500"
                                                        disabled={saving}
                                                    >
                                                        <Save className="w-3 h-3" />
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-2">
                                                    <span className={`font-mono ${showPasswords[`${project.job_number}-ops`] ? '' : 'blur-sm'}`}>
                                                        {project.ops_password || 'Not set'}
                                                    </span>
                                                    <button
                                                        onClick={() => setShowPasswords(p => ({ ...p, [`${project.job_number}-ops`]: !p[`${project.job_number}-ops`] }))}
                                                        className="p-1 text-slate-400 hover:text-white"
                                                    >
                                                        {showPasswords[`${project.job_number}-ops`] ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                                                    </button>
                                                    <button
                                                        onClick={() => setEditingProject(`${project.job_number}-ops`)}
                                                        className="p-1 text-slate-400 hover:text-cyan-400"
                                                    >
                                                        <Key className="w-3 h-3" />
                                                    </button>
                                                </div>
                                            )}
                                        </td>

                                        <td className="px-4 py-3 text-slate-400 text-sm">
                                            {project.created_at ? new Date(project.created_at).toLocaleDateString() : '-'}
                                        </td>

                                        <td className="px-4 py-3 text-right">
                                            {deleteConfirm === project.job_number ? (
                                                <div className="flex items-center justify-end gap-2">
                                                    <span className="text-red-400 text-sm">Delete?</span>
                                                    <button
                                                        onClick={() => handleDelete(project.job_number)}
                                                        className="px-2 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-500"
                                                    >
                                                        Yes
                                                    </button>
                                                    <button
                                                        onClick={() => setDeleteConfirm(null)}
                                                        className="px-2 py-1 bg-slate-600 text-white rounded text-sm hover:bg-slate-500"
                                                    >
                                                        No
                                                    </button>
                                                </div>
                                            ) : (
                                                <button
                                                    onClick={() => setDeleteConfirm(project.job_number)}
                                                    className="p-2 text-red-400 hover:bg-red-500/20 rounded-lg transition-colors"
                                                    title="Delete project"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* Warning */}
                <div className="flex items-center gap-3 mt-6 p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                    <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0" />
                    <p className="text-amber-200 text-sm">
                        Changes made here are permanent. Deleted projects cannot be recovered.
                    </p>
                </div>
            </div>
        </div>
    );
}
