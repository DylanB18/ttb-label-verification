export const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8MB
export const MAX_BATCH_IMAGES = 40;

export const VERIFY_RATE_LIMIT = { limit: 20, windowMs: 5 * 60 * 1000 }; // 20 single checks / 5 min / IP
export const BATCH_RATE_LIMIT = { limit: 3, windowMs: 10 * 60 * 1000 }; // 3 batches / 10 min / IP
