import React, { useState, useEffect } from 'react';
import { FolderOpen, Plus, Search, Trash2, Calendar, Clock, Building, Hash, ChevronRight, Loader2, AlertCircle } from 'lucide-react';
import { listProjects, createProject, deleteProject } from '../services/cloudStorage.js';

export default function ProjectDashboard({ onOpenProject, onCreateNew }) {
    const [projects, setProjects] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [search, setSearch] = useState('');
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newProject, setNewProject] = useState({ job_number: '', project_name: '', client_name: '', address: '' });
    const [creating, setCreating] = useState(false);
    const [createError, setCreateError] = useState('');

    // Load projects
    useEffect(() => {
        loadProjects();
    }, []);

    const loadProjects = async (searchTerm = '') => {
        setLoading(true);
        setError(null);
        try {
            const data = await listProjects(searchTerm);
            setProjects(data);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleSearch = (e) => {
        const value = e.target.value;
        setSearch(value);
        // Debounced search
        clearTimeout(window.searchTimeout);
        window.searchTimeout = setTimeout(() => loadProjects(value), 300);
    };

    const handleCreate = async () => {
        if (!newProject.job_number.trim() || !newProject.project_name.trim()) {
            setCreateError('Job number and project name are required');
            return;
        }

        setCreating(true);
        setCreateError('');
        try {
            const created = await createProject(newProject);
            setShowCreateModal(false);
            setNewProject({ job_number: '', project_name: '', client_name: '', address: '' });
            if (onCreateNew) {
                onCreateNew(created);
            } else {
                loadProjects();
            }
        } catch (err) {
            setCreateError(err.message);
        } finally {
            setCreating(false);
        }
    };

    const handleDelete = async (jobNumber, e) => {
        e.stopPropagation();
        if (!confirm(`Delete project ${jobNumber}? This cannot be undone.`)) return;

        try {
            await deleteProject(jobNumber);
            loadProjects(search);
        } catch (err) {
            alert('Failed to delete: ' + err.message);
        }
    };

    const formatDate = (dateStr) => {
        if (!dateStr) return 'N/A';
        return new Date(dateStr).toLocaleDateString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric'
        });
    };

    const getStatusColor = (status) => {
        switch (status) {
            case 'active': return 'bg-emerald-500/20 text-emerald-400';
            case 'completed': return 'bg-cyan-500/20 text-cyan-400';
            case 'on-hold': return 'bg-amber-500/20 text-amber-400';
            default: return 'bg-slate-500/20 text-slate-400';
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white p-8">
            <div className="max-w-6xl mx-auto">
                {/* Header with Logo */}
                <div className="flex flex-col items-center mb-8">
                    <div className="flex items-center gap-6 mb-6">
                        <img src="/logo.png" alt="3D Technology Services" style={{ height: '120px', width: 'auto' }} />
                        <div className="text-center">
                            <h1 className="text-3xl font-bold text-gold">LV Takeoff Intelligence</h1>
                            <p className="text-gold/60 text-sm">AI-Powered Low-Voltage Construction Estimation</p>
                        </div>
                    </div>
                    <div className="w-full flex items-center justify-between">
                        <div>
                            <h2 className="text-2xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
                                Project Dashboard
                            </h2>
                            <p className="text-slate-400 mt-1">Select a project or create a new one</p>
                        </div>
                        <button
                            onClick={() => setShowCreateModal(true)}
                            className="flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-xl font-medium hover:shadow-lg hover:shadow-cyan-500/25 transition-all"
                        >
                            <Plus className="w-5 h-5" />
                            New Project
                        </button>
                    </div>
                </div>

                {/* Search */}
                <div className="relative mb-6">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                    <input
                        type="text"
                        value={search}
                        onChange={handleSearch}
                        placeholder="Search by job number, project name, or client..."
                        className="w-full pl-12 pr-4 py-3 bg-slate-800/50 border border-slate-700/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-transparent"
                    />
                </div>

                {/* Error State */}
                {error && (
                    <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl mb-6 flex items-center gap-3">
                        <AlertCircle className="w-5 h-5 text-red-400" />
                        <span className="text-red-400">{error}</span>
                    </div>
                )}

                {/* Loading State */}
                {loading && (
                    <div className="flex items-center justify-center py-20">
                        <Loader2 className="w-8 h-8 animate-spin text-cyan-500" />
                        <span className="ml-3 text-slate-400">Loading projects...</span>
                    </div>
                )}

                {/* Empty State */}
                {!loading && projects.length === 0 && (
                    <div className="text-center py-20">
                        <FolderOpen className="w-16 h-16 text-slate-600 mx-auto mb-4" />
                        <h3 className="text-xl font-medium text-slate-400 mb-2">No projects yet</h3>
                        <p className="text-slate-500 mb-6">Create your first project to get started</p>
                        <button
                            onClick={() => setShowCreateModal(true)}
                            className="px-6 py-3 bg-cyan-500/20 text-cyan-400 rounded-xl hover:bg-cyan-500/30 transition-colors"
                        >
                            Create Project
                        </button>
                    </div>
                )}

                {/* Project Grid */}
                {!loading && projects.length > 0 && (
                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {projects.map(project => (
                            <div
                                key={project.id}
                                onClick={() => onOpenProject(project)}
                                className="group p-5 bg-slate-800/30 border border-slate-700/50 rounded-2xl hover:border-cyan-500/50 hover:bg-slate-800/50 cursor-pointer transition-all"
                            >
                                <div className="flex items-start justify-between mb-4">
                                    <div className="flex items-center gap-2">
                                        <Hash className="w-4 h-4 text-cyan-400" />
                                        <span className="font-mono font-bold text-cyan-400">{project.job_number}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className={`text-xs px-2 py-1 rounded-full ${getStatusColor(project.status)}`}>
                                            {project.status}
                                        </span>
                                        <button
                                            onClick={(e) => handleDelete(project.job_number, e)}
                                            className="p-1 opacity-0 group-hover:opacity-100 hover:bg-red-500/20 rounded transition-all"
                                        >
                                            <Trash2 className="w-4 h-4 text-red-400" />
                                        </button>
                                    </div>
                                </div>

                                <h3 className="font-semibold text-lg mb-2 truncate">{project.project_name}</h3>

                                {project.client_name && (
                                    <div className="flex items-center gap-2 text-sm text-slate-400 mb-1">
                                        <Building className="w-4 h-4" />
                                        <span className="truncate">{project.client_name}</span>
                                    </div>
                                )}

                                <div className="flex items-center gap-4 text-xs text-slate-500 mt-4 pt-4 border-t border-slate-700/50">
                                    <div className="flex items-center gap-1">
                                        <Calendar className="w-3 h-3" />
                                        <span>{formatDate(project.created_at)}</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <Clock className="w-3 h-3" />
                                        <span>Updated {formatDate(project.updated_at)}</span>
                                    </div>
                                </div>

                                <div className="flex items-center justify-end mt-3 text-cyan-400 text-sm opacity-0 group-hover:opacity-100 transition-opacity">
                                    Open Project <ChevronRight className="w-4 h-4 ml-1" />
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Create Modal */}
                {showCreateModal && (
                    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
                        <div className="bg-slate-900 rounded-2xl border border-slate-700 p-6 w-full max-w-md">
                            <h2 className="text-xl font-bold mb-6">Create New Project</h2>

                            {createError && (
                                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg mb-4 text-red-400 text-sm">
                                    {createError}
                                </div>
                            )}

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm text-slate-400 mb-1">Job Number *</label>
                                    <input
                                        type="text"
                                        value={newProject.job_number}
                                        onChange={(e) => setNewProject({ ...newProject, job_number: e.target.value })}
                                        placeholder="e.g., 2026-0001"
                                        className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm text-slate-400 mb-1">Project Name *</label>
                                    <input
                                        type="text"
                                        value={newProject.project_name}
                                        onChange={(e) => setNewProject({ ...newProject, project_name: e.target.value })}
                                        placeholder="e.g., Main Street Office Building"
                                        className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm text-slate-400 mb-1">Client Name</label>
                                    <input
                                        type="text"
                                        value={newProject.client_name}
                                        onChange={(e) => setNewProject({ ...newProject, client_name: e.target.value })}
                                        placeholder="e.g., Acme Corporation"
                                        className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm text-slate-400 mb-1">Address</label>
                                    <input
                                        type="text"
                                        value={newProject.address}
                                        onChange={(e) => setNewProject({ ...newProject, address: e.target.value })}
                                        placeholder="e.g., 123 Main St, Sacramento, CA"
                                        className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500"
                                    />
                                </div>
                            </div>

                            <div className="flex justify-end gap-3 mt-6">
                                <button
                                    onClick={() => { setShowCreateModal(false); setCreateError(''); }}
                                    className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleCreate}
                                    disabled={creating}
                                    className="flex items-center gap-2 px-5 py-2 bg-cyan-500 text-white rounded-lg hover:bg-cyan-600 disabled:opacity-50 transition-colors"
                                >
                                    {creating && <Loader2 className="w-4 h-4 animate-spin" />}
                                    Create Project
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
