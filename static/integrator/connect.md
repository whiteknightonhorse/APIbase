# Connect AI payment (human form)

This page is a browser form: three steps, about five minutes, free. Smart-contract wallets (ERC-1271) are accepted.

## Step 1. Your store

Fill in six fields (Support email is an optional seventh):

- Shop name: shown to buyers and AI agents.
- Website: your store's address, starting with https://
- Contact email: never shown to buyers. We write only about your shop.
- Support email (optional): shown to buyers on their orders.
- Category: what you mainly sell. Helps agents find you.
- Country: where your business is registered.
- Shop address: filled in from your shop name. Lowercase letters, numbers and dashes. Your page will be apibase.pro/m/<address>. If the address is taken, the form says so under the field; pick another one.

## Step 2. Agreements

There is no checkbox. You accept the Merchant Agreement, Acceptable Use Policy, Data Processing Addendum and Refund Framework with your wallet signature in step 3 (each document is linked here and opens in a new tab; the versions are listed at /legal/index.json). The signature is free, no payment.

## Step 3. Connect wallet

Your wallet asks for 3 free signatures. No gas, no money leaves your wallet:

1. Register your encryption key: lets only you read buyers' order details.
2. Sign in: proves this wallet is yours.
3. Accept the documents: the four documents of step 2, each with its version and hash.

Network: Base. Payouts go to this wallet in USDC (you can pick a different payout wallet in the form; leave it empty unless you need a different wallet; a marketplace you sell through may require the payout wallet to equal the signing wallet). If a signature is rejected, nothing is charged: press Try again and approve it in your wallet. No wallet yet? See /integrator/wallet.

Arrived from a marketplace link? The form is prefilled from it (check the values, every field stays editable); if the marketplace does not pass your email, the page says so under Contact email and you type the address yourself. If your wallet differs from the one the marketplace has on file you see a "Different wallet" notice with both addresses, a line naming the account to choose and a "Choose account in wallet" button where your wallet supports it, and the signatures wait until you switch to that account in your wallet (see /integrator/docs#partner-handoff). If the marketplace asked to sell for you, your wallet asks for 1 free signature instead (the page shows one sentence about it and keeps the list under "What the message says"): one message states your encryption key, the registration, the four documents and "Allow <marketplace> to sell for you", which lets it upload your catalog and receive your orders (never payouts, keys, orders or refunds) and is revocable any time; rejecting the signature registers nothing (see /integrator/docs#handoff-one-signature).

## When your store is connected

The page shows your API key and your decryption key once. Shown once: save both now in a password manager; they cannot be shown again, and if you lose them you have to reconnect your store. Never send these keys to anyone, in a message or in a screenshot: whoever has the API key can change your store. Then work through the next steps: add your catalog, set your webhook, pay the $0.01 test order, and check your store at /integrator/check/<address>. The steps are described in /integrator/agent-guide.

Arrived from a marketplace? Tick "I saved both keys. They are shown only once.": that enables "Continue on <marketplace>", and the page returns only when you press it. If the marketplace sells for you there is nothing else to do; otherwise the four steps are under "Set the store up yourself". A marketplace that adds your products for you may hide the keys (see /integrator/docs#shop-without-keys): after you allow it, the page shows no keys, says there is nothing to save, and returns you to the marketplace after 5 seconds.

If your wallet already has a store, a marketplace link that asked to sell for you shows "Allow <marketplace>" (one signature, no new store, no new keys); without that request the page tells you to ask the marketplace for a link that connects an existing store.

No wallet in the browser? Use your agent: see /integrator/agent-guide.
