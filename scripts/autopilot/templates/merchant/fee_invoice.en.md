Subject: Your APIbase platform fee invoice

Hello {merchant_name},

Your Base orders accrued a platform fee for {period}. Invoice {invoice_id}: {amount_usd} USD, due {due_at}.

Send USDC on Base to {fee_wallet}, using the invoice id as your reference, then register the transaction: POST /api/v1/shop/merchants/me/fee-invoices/{invoice_id}/paid with the transaction hash as tx_hash.

If an invoice stays unpaid 30 days after its due date, new quotes for your shop offer the Tempo rail only; after 60 days the shop is suspended. Settling the invoice lifts both limits automatically. Check page: https://apibase.pro/integrator/check/{slug}
