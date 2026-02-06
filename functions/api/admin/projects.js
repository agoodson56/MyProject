// Admin API - List all projects with full details including passwords
// This endpoint returns sensitive data and should be protected

function corsHeaders() {
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json'
    };
}

export async function onRequestGet(context) {
    const { env } = context;

    if (!env.DB) {
        return new Response(JSON.stringify({ error: 'D1 database not bound' }), {
            status: 500,
            headers: corsHeaders()
        });
    }

    try {
        // Get all projects with all fields including passwords
        const results = await env.DB.prepare(`
            SELECT job_number, project_name, client_name, address, status, 
                   pm_password, ops_password, created_at, updated_at
            FROM projects
            ORDER BY created_at DESC
        `).all();

        return new Response(JSON.stringify(results.results), {
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
