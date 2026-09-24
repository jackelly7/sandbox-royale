import { GameError } from './model.ts';
export function serviceError(error: unknown) {
  if (
    error instanceof Error &&
    /exceeded.{0,40}quota|quota.{0,40}exceeded/i.test(error.message)
  )
    return {
      type: 'error',
      status: 503,
      retryable: false,
      message:
        'Multiplayer is temporarily unavailable. The game owner needs to restore server capacity.',
    };
  if (error instanceof GameError)
    return {
      type: 'error',
      status: error.status,
      retryable: ![401, 404].includes(error.status),
      message: error.message,
    };
  return {
    type: 'error',
    status: 503,
    retryable: true,
    message: 'Connection interrupted. Reconnecting...',
  };
}
