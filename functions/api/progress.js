// Progress API - Cloudflare Pages Function
// Handles progress tracking and daily logs

function corsHeaders() {
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json'
    };
}

// GET /api/progress?job_number=XXX - Get all progress for a project
export async function onRequestGet(context) {
    const { env, request } = context;
    const url = new URL(request.url);
    const jobNumber = url.searchParams.get('job_number');

    if (!jobNumber) {
        return new Response(JSON.stringify({ error: 'job_number required' }), {
            status: 400,
            headers: corsHeaders()
        });
    }

    try {
        // Get project ID
        const project = await env.DB.prepare('SELECT id FROM projects WHERE job_number = ?').bind(jobNumber).first();
        if (!project) {
            return new Response(JSON.stringify({ error: 'Project not found' }), {
                status: 404,
                headers: corsHeaders()
            });
        }

        // Get progress data
        const progress = await env.DB.prepare(`
      SELECT material_id, installed, labor_used, updated_at
      FROM progress
      WHERE project_id = ?
    `).bind(project.id).all();

        // Get daily logs
        const logs = await env.DB.prepare(`
      SELECT id, module_id, item, unit, qty_installed, hours_used, notes, created_at
      FROM daily_logs
      WHERE project_id = ?
      ORDER BY created_at DESC
    `).bind(project.id).all();

        return new Response(JSON.stringify({
            progress: progress.results,
            daily_logs: logs.results
        }), {
            headers: corsHeaders()
        });
    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: corsHeaders()
        });
    }
}

// PUT /api/progress - Batch update progress
export async function onRequestPut(context) {
    const { env, request } = context;

    try {
        const data = await request.json();
        const { job_number, progress } = data;

        if (!job_number || !progress) {
            return new Response(JSON.stringify({ error: 'job_number and progress required' }), {
                status: 400,
                headers: corsHeaders()
            });
        }

        // Get project ID
        const project = await env.DB.prepare('SELECT id FROM projects WHERE job_number = ?').bind(job_number).first();
        if (!project) {
            return new Response(JSON.stringify({ error: 'Project not found' }), {
                status: 404,
                headers: corsHeaders()
            });
        }

        const now = new Date().toISOString();

        // Batch upsert progress
        const statements = Object.entries(progress).map(([materialId, data]) => {
            return env.DB.prepare(`
        INSERT INTO progress (project_id, material_id, installed, labor_used, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(project_id, material_id) DO UPDATE SET
          installed = ?,
          labor_used = ?,
          updated_at = ?
      `).bind(
                project.id, materialId, data.installed || 0, data.laborUsed || 0, now,
                data.installed || 0, data.laborUsed || 0, now
            );
        });

        await env.DB.batch(statements);

        // Update project timestamp
        await env.DB.prepare('UPDATE projects SET updated_at = ? WHERE id = ?').bind(now, project.id).run();

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

// POST /api/progress - Add daily log entry
export async function onRequestPost(context) {
    const { env, request } = context;

    try {
        const data = await request.json();
        const { job_number, module_id, item, unit, qty_installed, hours_used, notes } = data;

        if (!job_number || !item) {
            return new Response(JSON.stringify({ error: 'job_number and item required' }), {
                status: 400,
                headers: corsHeaders()
            });
        }

        // Get project ID
        const project = await env.DB.prepare('SELECT id FROM projects WHERE job_number = ?').bind(job_number).first();
        if (!project) {
            return new Response(JSON.stringify({ error: 'Project not found' }), {
                status: 404,
                headers: corsHeaders()
            });
        }

        const now = new Date().toISOString();

        // Insert log entry
        const result = await env.DB.prepare(`
      INSERT INTO daily_logs (project_id, module_id, item, unit, qty_installed, hours_used, notes, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(project.id, module_id || null, item, unit || 'EA', qty_installed || 0, hours_used || 0, notes || null, now).run();

        // Update project timestamp
        await env.DB.prepare('UPDATE projects SET updated_at = ? WHERE id = ?').bind(now, project.id).run();

        return new Response(JSON.stringify({
            id: result.meta.last_row_id,
            created_at: now
        }), {
            status: 201,
            headers: corsHeaders()
        });
    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: corsHeaders()
        });
    }
}

// DELETE /api/progress?job_number=XXX&log_id=YYY - Delete a daily log entry
export async function onRequestDelete(context) {
    const { env, request } = context;
    const url = new URL(request.url);
    const jobNumber = url.searchParams.get('job_number');
    const logId = url.searchParams.get('log_id');

    if (!jobNumber || !logId) {
        return new Response(JSON.stringify({ error: 'job_number and log_id required' }), {
            status: 400,
            headers: corsHeaders()
        });
    }

    try {
        // Get project ID
        const project = await env.DB.prepare('SELECT id FROM projects WHERE job_number = ?').bind(jobNumber).first();
        if (!project) {
            return new Response(JSON.stringify({ error: 'Project not found' }), {
                status: 404,
                headers: corsHeaders()
            });
        }

        const result = await env.DB.prepare('DELETE FROM daily_logs WHERE id = ? AND project_id = ?').bind(logId, project.id).run();

        if (result.changes === 0) {
            return new Response(JSON.stringify({ error: 'Log entry not found' }), {
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
