// Projects API - Cloudflare Pages Function
// Handles CRUD operations for projects
// Updated to work with single-table schema where job_number is the primary key

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
                SELECT * FROM projects WHERE job_number = ?
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
                SELECT job_number, project_name, client_name, address, status, created_at, updated_at
                FROM projects
                WHERE job_number LIKE ? OR project_name LIKE ? OR client_name LIKE ?
                ORDER BY updated_at DESC
            `).bind(`%${search}%`, `%${search}%`, `%${search}%`).all();
            results = results.results;

        } else {
            // List all projects
            results = await env.DB.prepare(`
                SELECT job_number, project_name, client_name, address, status, created_at, updated_at
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

// POST /api/projects - Create new project
export async function onRequestPost(context) {
    const { env, request } = context;

    if (!env.DB) {
        return new Response(JSON.stringify({ error: 'D1 database not bound' }), {
            status: 500,
            headers: corsHeaders()
        });
    }

    try {
        const data = await request.json();
        const { job_number, project_name, client_name, address, device_counts, bom_data, settings, issues } = data;

        if (!job_number || !project_name) {
            return new Response(JSON.stringify({ error: 'job_number and project_name are required' }), {
                status: 400,
                headers: corsHeaders()
            });
        }

        const now = new Date().toISOString();

        // Generate random passwords for new projects
        const pmPassword = Math.random().toString(36).substring(2, 8).toUpperCase();
        const opsPassword = Math.random().toString(36).substring(2, 8).toUpperCase();

        // Insert project into single table
        await env.DB.prepare(`
            INSERT INTO projects (job_number, project_name, client_name, address, device_counts, bom_data, settings, issues, pm_password, ops_password, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
            job_number,
            project_name,
            client_name || null,
            address || null,
            device_counts ? JSON.stringify(device_counts) : null,
            bom_data ? JSON.stringify(bom_data) : null,
            settings ? JSON.stringify(settings) : null,
            issues ? JSON.stringify(issues) : null,
            pmPassword,
            opsPassword,
            now,
            now
        ).run();

        return new Response(JSON.stringify({
            job_number,
            project_name,
            created_at: now,
            pm_password: pmPassword,
            ops_password: opsPassword
        }), {
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

// PUT /api/projects?job_number=XXX - Update project
export async function onRequestPut(context) {
    const { env, request } = context;
    const url = new URL(request.url);
    const jobNumber = url.searchParams.get('job_number');

    if (!env.DB) {
        return new Response(JSON.stringify({ error: 'D1 database not bound' }), {
            status: 500,
            headers: corsHeaders()
        });
    }

    if (!jobNumber) {
        return new Response(JSON.stringify({ error: 'job_number query param required' }), {
            status: 400,
            headers: corsHeaders()
        });
    }

    try {
        const data = await request.json();
        const { project_name, client_name, address, device_counts, bom_data, settings, issues, status, pm_password, ops_password } = data;
        const now = new Date().toISOString();

        // Check if project exists
        const existing = await env.DB.prepare('SELECT job_number FROM projects WHERE job_number = ?').bind(jobNumber).first();
        if (!existing) {
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
                device_counts = COALESCE(?, device_counts),
                bom_data = COALESCE(?, bom_data),
                settings = COALESCE(?, settings),
                issues = COALESCE(?, issues),
                pm_password = COALESCE(?, pm_password),
                ops_password = COALESCE(?, ops_password),
                updated_at = ?
            WHERE job_number = ?
        `).bind(
            project_name || null,
            client_name || null,
            address || null,
            status || null,
            device_counts ? JSON.stringify(device_counts) : null,
            bom_data ? JSON.stringify(bom_data) : null,
            settings ? JSON.stringify(settings) : null,
            issues ? JSON.stringify(issues) : null,
            pm_password || null,
            ops_password || null,
            now,
            jobNumber
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

// DELETE /api/projects?job_number=XXX - Delete project
export async function onRequestDelete(context) {
    const { env, request } = context;
    const url = new URL(request.url);
    const jobNumber = url.searchParams.get('job_number');

    if (!env.DB) {
        return new Response(JSON.stringify({ error: 'D1 database not bound' }), {
            status: 500,
            headers: corsHeaders()
        });
    }

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

// OPTIONS - CORS preflight
export async function onRequestOptions() {
    return new Response(null, {
        headers: corsHeaders()
    });
}
