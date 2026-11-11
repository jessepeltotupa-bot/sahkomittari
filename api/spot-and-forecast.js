// Spotpuls Serverless API: /api/spot-and-forecast
// Multi-zone wrapper delegating to /api/v1/prices while maintaining backward-compatible top-level fields.

import handlerV1 from './v1/prices.js';

export default async function handler(req, res) {
    return handlerV1(req, res);
}
