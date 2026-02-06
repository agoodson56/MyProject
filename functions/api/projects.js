// Projects API - Cloudflare Pages Function
// Handles CRUD operations for projects

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function corsHeaders() {
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json'
    };
}

// GET /api/projects - List all projects
// GET /api/projects?job_number=XXX - Get by job number
// POST /api/projects - Create new project
export async function onRequestGet(context) {
    const { env, request } = context;
    const url = new URL(request.url);
    const jobNumber = url.searchParams.get('job_number');
    const search = url.searchParams.get('search');

    // Debug: Check if D1 binding exists
    if (!env.DB) {
        return new Response(JSON.stringify({
            error: 'D1 database not bound. Check Cloudflare Pages bindings.',
            env_keys: Object.keys(env)
        }), {
            status: 500,
            headers: corsHeaders()
        });
    }

    try {
        let results;

        if (jobNumber) {
            // Get specific project by job number
            results = await env.DB.prepare(`
        SELECT p.*, pd.device_counts, pd.bom_data, pd.settings, pd.issues
        FROM projects p
        LEFT JOIN project_data pd ON p.id = pd.project_id
        WHERE p.job_number = ?
      `).bind(jobNumber).first();

            if (!results) {
                return new Response(JSON.stringify({ error: 'Project not found' }), {
                    status: 404,
                    headers: corsHeaders()
                });
            }

            // Parse JSON fields
            if (results.device_counts) results.device_counts = JSON.parse(results.device_counts);
            if (results.bom_data) results.bom_data = JSON.parse(results.bom_data);
            if (results.settings) results.settings = JSON.parse(results.settings);
            if (results.issues) results.issues = JSON.parse(results.issues);

        } else if (search) {
            // Search projects
            results = await env.DB.prepare(`
        SELECT id, job_number, project_name, client_name, created_at, updated_at, status
        FROM projects
        WHERE job_number LIKE ? OR project_name LIKE ? OR client_name LIKE ?
        ORDER BY updated_at DESC
      `).bind(`%${search}%`, `%${search}%`, `%${search}%`).all();
            results = results.results;

        } else {
            // List all projects
            results = await env.DB.prepare(`
        SELECT id, job_number, project_name, client_name, created_at, updated_at, status
        FROM projects
        ORDER BY updated_at DESC
      `).all();
            results = results.results;
        }

        return new Response(JSON.stringify(results), {
            headers: corsHeaders()
        });
    } catch (error) {
        return new Response(JSON.stringify({
            error: error.message,
            stack: error.stack,
            type: 'database_error'
        }), {
            status: 500,
            headers: corsHeaders()
        });
    }
}

export async function onRequestPost(context) {
    const { env, request } = context;

    try {
        const data = await request.json();
        const { job_number, project_name, client_name, address, device_counts, bom_data, settings, issues } = data;

        if (!job_number || !project_name) {
            return new Response(JSON.stringify({ error: 'job_number and project_name are required' }), {
                status: 400,
                headers: corsHeaders()
            });
        }

        const id = generateId();
        const now = new Date().toISOString();

        // Insert project
        await env.DB.prepare(`
      INSERT INTO projects (id, job_number, project_name, client_name, address, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(id, job_number, project_name, client_name || null, address || null, now, now).run();

        // Insert project data
        await env.DB.prepare(`
      INSERT INTO project_data (project_id, device_counts, bom_data, settings, issues, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
            id,
            device_counts ? JSON.stringify(device_counts) : null,
            bom_data ? JSON.stringify(bom_data) : null,
            settings ? JSON.stringify(settings) : null,
            issues ? JSON.stringify(issues) : null,
            now
        ).run();

        return new Response(JSON.stringify({ id, job_number, project_name, created_at: now }), {
            status: 201,
            headers: corsHeaders()
        });
    } catch (error) {
        if (error.message.includes('UNIQUE constraint failed')) {
            return new Response(JSON.stringify({ error: 'Job number already exists' }), {
                status: 409,
                headers: corsHeaders()
            });
        }
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: corsHeaders()
        });
    }
}

export async function onRequestPut(context) {
    const { env, request } = context;
    const url = new URL(request.url);
    const jobNumber = url.searchParams.get('job_number');

    if (!jobNumber) {
        return new Response(JSON.stringify({ error: 'job_number query param required' }), {
            status: 400,
            headers: corsHeaders()
        });
    }

    try {
        const data = await request.json();
        const { project_name, client_name, address, device_counts, bom_data, settings, issues, status } = data;
        const now = new Date().toISOString();

        // Get project ID
        const project = await env.DB.prepare('SELECT id FROM projects WHERE job_number = ?').bind(jobNumber).first();
        if (!project) {
            return new Response(JSON.stringify({ error: 'Project not found' }), {
                status: 404,
                headers: corsHeaders()
            });
        }

        // Update project
        await env.DB.prepare(`
      UPDATE projects SET
        project_name = COALESCE(?, project_name),
        client_name = COALESCE(?, client_name),
        address = COALESCE(?, address),
        status = COALESCE(?, status),
        updated_at = ?
      WHERE id = ?
    `).bind(project_name, client_name, address, status, now, project.id).run();

        // Update project data
        await env.DB.prepare(`
      INSERT INTO project_data (project_id, device_counts, bom_data, settings, issues, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(project_id) DO UPDATE SET
        device_counts = COALESCE(?, device_counts),
        bom_data = COALESCE(?, bom_data),
        settings = COALESCE(?, settings),
        issues = COALESCE(?, issues),
        updated_at = ?
    `).bind(
            project.id,
            device_counts ? JSON.stringify(device_counts) : null,
            bom_data ? JSON.stringify(bom_data) : null,
            settings ? JSON.stringify(settings) : null,
            issues ? JSON.stringify(issues) : null,
            now,
            device_counts ? JSON.stringify(device_counts) : null,
            bom_data ? JSON.stringify(bom_data) : null,
            settings ? JSON.stringify(settings) : null,
            issues ? JSON.stringify(issues) : null,
            now
        ).run();

        return new Response(JSON.stringify({ success: true, updated_at: now }), {
            headers: corsHeaders()
        });
    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: corsHeaders()
        });
    }
}

export async function onRequestDelete(context) {
    const { env, request } = context;
    const url = new URL(request.url);
    const jobNumber = url.searchParams.get('job_number');

    if (!jobNumber) {
        return new Response(JSON.stringify({ error: 'job_number query param required' }), {
            status: 400,
            headers: corsHeaders()
        });
    }

    try {
        const result = await env.DB.prepare('DELETE FROM projects WHERE job_number = ?').bind(jobNumber).run();

        if (result.changes === 0) {
            return new Response(JSON.stringify({ error: 'Project not found' }), {
                status: 404,
                headers: corsHeaders()
            });
        }

        return new Response(JSON.stringify({ success: true }), {
            headers: corsHeaders()
        });
    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: corsHeaders()
        });
    }
}

export async function onRequestOptions() {
    return new Response(null, {
        headers: corsHeaders()
    });
}
