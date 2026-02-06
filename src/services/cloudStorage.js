// Cloud Storage Service - API client for D1 database
// Handles all project data persistence

const API_BASE = '/api';

// Check if running locally (development) or on Cloudflare
const isLocal = typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

// Fallback to localStorage when D1 is not available
const useLocalStorage = isLocal;

// ============ Projects ============

export async function listProjects(search = '') {
    if (useLocalStorage) {
        return listProjectsLocal(search);
    }

    const url = search
        ? `${API_BASE}/projects?search=${encodeURIComponent(search)}`
        : `${API_BASE}/projects`;

    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to fetch projects');
    return res.json();
}

export async function getProject(jobNumber) {
    if (useLocalStorage) {
        return getProjectLocal(jobNumber);
    }

    const res = await fetch(`${API_BASE}/projects?job_number=${encodeURIComponent(jobNumber)}`);
    if (!res.ok) {
        if (res.status === 404) return null;
        throw new Error('Failed to fetch project');
    }
    return res.json();
}

export async function createProject(data) {
    if (useLocalStorage) {
        return createProjectLocal(data);
    }

    const res = await fetch(`${API_BASE}/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });

    if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to create project');
    }
    return res.json();
}

export async function updateProject(jobNumber, data) {
    if (useLocalStorage) {
        return updateProjectLocal(jobNumber, data);
    }

    const res = await fetch(`${API_BASE}/projects?job_number=${encodeURIComponent(jobNumber)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });

    if (!res.ok) throw new Error('Failed to update project');
    return res.json();
}

export async function deleteProject(jobNumber) {
    if (useLocalStorage) {
        return deleteProjectLocal(jobNumber);
    }

    const res = await fetch(`${API_BASE}/projects?job_number=${encodeURIComponent(jobNumber)}`, {
        method: 'DELETE'
    });

    if (!res.ok) throw new Error('Failed to delete project');
    return res.json();
}

// ============ Progress ============

export async function getProgress(jobNumber) {
    if (useLocalStorage) {
        return getProgressLocal(jobNumber);
    }

    const res = await fetch(`${API_BASE}/progress?job_number=${encodeURIComponent(jobNumber)}`);
    if (!res.ok) throw new Error('Failed to fetch progress');
    return res.json();
}

export async function saveProgress(jobNumber, progress) {
    if (useLocalStorage) {
        return saveProgressLocal(jobNumber, progress);
    }

    const res = await fetch(`${API_BASE}/progress`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_number: jobNumber, progress })
    });

    if (!res.ok) throw new Error('Failed to save progress');
    return res.json();
}

export async function addDailyLog(jobNumber, log) {
    if (useLocalStorage) {
        return addDailyLogLocal(jobNumber, log);
    }

    const res = await fetch(`${API_BASE}/progress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_number: jobNumber, ...log })
    });

    if (!res.ok) throw new Error('Failed to add log entry');
    return res.json();
}

export async function deleteDailyLog(jobNumber, logId) {
    if (useLocalStorage) {
        return deleteDailyLogLocal(jobNumber, logId);
    }

    const res = await fetch(`${API_BASE}/progress?job_number=${encodeURIComponent(jobNumber)}&log_id=${logId}`, {
        method: 'DELETE'
    });

    if (!res.ok) throw new Error('Failed to delete log entry');
    return res.json();
}

// ============ LocalStorage Fallback ============
// Used during development or when D1 is not available

const PROJECTS_KEY = 'lv-takeoff-projects';

function getStoredProjects() {
    try {
        return JSON.parse(localStorage.getItem(PROJECTS_KEY) || '[]');
    } catch {
        return [];
    }
}

function saveStoredProjects(projects) {
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
}

function listProjectsLocal(search = '') {
    let projects = getStoredProjects();
    if (search) {
        const s = search.toLowerCase();
        projects = projects.filter(p =>
            p.job_number.toLowerCase().includes(s) ||
            p.project_name.toLowerCase().includes(s) ||
            (p.client_name || '').toLowerCase().includes(s)
        );
    }
    return Promise.resolve(projects.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at)));
}

function getProjectLocal(jobNumber) {
    const projects = getStoredProjects();
    const project = projects.find(p => p.job_number === jobNumber);
    return Promise.resolve(project || null);
}

// Generate a random 6-character password
function generatePassword() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Avoiding confusing chars like 0/O, 1/I
    let password = '';
    for (let i = 0; i < 6; i++) {
        password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
}

function createProjectLocal(data) {
    const projects = getStoredProjects();
    if (projects.some(p => p.job_number === data.job_number)) {
        return Promise.reject(new Error('Job number already exists'));
    }

    const now = new Date().toISOString();
    const newProject = {
        id: Date.now().toString(36) + Math.random().toString(36).substr(2),
        ...data,
        pm_password: data.pm_password || generatePassword(),
        ops_password: data.ops_password || generatePassword(),
        created_at: now,
        updated_at: now,
        status: 'active'
    };

    projects.push(newProject);
    saveStoredProjects(projects);
    return Promise.resolve(newProject);
}

function updateProjectLocal(jobNumber, data) {
    const projects = getStoredProjects();
    const index = projects.findIndex(p => p.job_number === jobNumber);
    if (index === -1) {
        return Promise.reject(new Error('Project not found'));
    }

    projects[index] = {
        ...projects[index],
        ...data,
        updated_at: new Date().toISOString()
    };

    saveStoredProjects(projects);
    return Promise.resolve({ success: true, updated_at: projects[index].updated_at });
}

function deleteProjectLocal(jobNumber) {
    const projects = getStoredProjects();
    const filtered = projects.filter(p => p.job_number !== jobNumber);
    if (filtered.length === projects.length) {
        return Promise.reject(new Error('Project not found'));
    }
    saveStoredProjects(filtered);
    return Promise.resolve({ success: true });
}

function getProgressLocal(jobNumber) {
    const key = `lv-progress-${jobNumber}`;
    try {
        return Promise.resolve(JSON.parse(localStorage.getItem(key) || '{"progress":[],"daily_logs":[]}'));
    } catch {
        return Promise.resolve({ progress: [], daily_logs: [] });
    }
}

function saveProgressLocal(jobNumber, progress) {
    const key = `lv-progress-${jobNumber}`;
    const existing = JSON.parse(localStorage.getItem(key) || '{"progress":[],"daily_logs":[]}');
    existing.progress = Object.entries(progress).map(([material_id, data]) => ({
        material_id,
        installed: data.installed || 0,
        labor_used: data.laborUsed || 0
    }));
    localStorage.setItem(key, JSON.stringify(existing));
    return Promise.resolve({ success: true });
}

function addDailyLogLocal(jobNumber, log) {
    const key = `lv-progress-${jobNumber}`;
    const existing = JSON.parse(localStorage.getItem(key) || '{"progress":[],"daily_logs":[]}');
    const newLog = {
        id: Date.now(),
        ...log,
        created_at: new Date().toISOString()
    };
    existing.daily_logs.unshift(newLog);
    localStorage.setItem(key, JSON.stringify(existing));
    return Promise.resolve(newLog);
}

function deleteDailyLogLocal(jobNumber, logId) {
    const key = `lv-progress-${jobNumber}`;
    const existing = JSON.parse(localStorage.getItem(key) || '{"progress":[],"daily_logs":[]}');
    existing.daily_logs = existing.daily_logs.filter(l => l.id !== logId);
    localStorage.setItem(key, JSON.stringify(existing));
    return Promise.resolve({ success: true });
}
