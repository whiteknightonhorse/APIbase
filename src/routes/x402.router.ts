import { Router } from 'express';
import { getReceipt } from '../services/receipt.service';

export const x402Router = Router();

x402Router.get('/x402/retrieve/:receiptId', async (req, res, next) => {
  try {
    const { receiptId } = req.params;

    const receipt = await getReceipt(receiptId);
    if (!receipt) {
      res.status(404).json({
        error: 'not_found',
        message: 'Receipt not found',
        request_id: req.requestId,
      });
      return;
    }

    res.json({
      status: 'completed',
      idempotency_key: `sha256_${receipt.receiptId}`,
      original_request: {
        tool: receipt.toolId,
        params: {},
      },
      response: receipt.response,
      payment: {
        tx_hash: receipt.txHash,
        amount: receipt.payment.amount,
        token: receipt.payment.token,
        network: receipt.payment.network,
        confirmed_at: receipt.payment.confirmed_at,
      },
      cached_until: receipt.cached_until,
    });
  } catch (err) {
    next(err);
  }
});
