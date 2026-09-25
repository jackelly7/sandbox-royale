import deployment from '../../server/deployment.json' with { type: 'json' };

export const MULTIPLAYER_URL = '/api/multiplayer';
export const MULTIPLAYER_ORIGIN = deployment.url;
export const REALTIME_URL = MULTIPLAYER_ORIGIN.replace(/^http/, 'ws') + '/ws';
