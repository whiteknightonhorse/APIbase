# Partners that sell for you

A partner permission lets a marketplace you allowed upload your catalog and receive your order events for your store. Stopping it takes one free wallet signature, no gas; it does not close your store and does not touch your payouts or orders.

## Stop a partner

The page https://apibase.pro/integrator/permissions lists one row per partner, each with one button: "Stop <Partner name>". A link with `?partner=<partner id>` shows only that partner's row. No API key is needed: the wallet of your store is the credential, and a suspended or deactivated store can stop a partner too.

When you press the button, your wallet opens (if you have several wallets in the browser, you choose one first; nothing is asked of a wallet before you press), shares your account, and asks for one signature over a short text from APIbase that names the partner and says what stops. No transaction, no payment, no gas.

## What the page tells you

- "<Partner name> no longer sells for your store. You can allow it again from <Partner name>." The partner can no longer upload your catalog or receive your order events.
- "This wallet has not allowed <Partner name>." Nothing to stop for this wallet.
- "This wallet has no store on APIbase." Use the wallet your store was opened with.
- "Signature rejected. Nothing changed." with a Try again button.
- Any other error: its message, with a Try again button.

No wallet in the browser? See /integrator/wallet.

## For developers

The message, the route and its answers: /integrator/docs#partner-grants (step 6).
