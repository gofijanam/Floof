if(process.env.FLOOF_ROLE==='jobs')await import('./jobs-service.mjs');
else await import('./railway-server.mjs');
