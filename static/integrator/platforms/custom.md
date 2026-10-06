# Custom site: add AI payment

For a site you build yourself. Nothing to install, no plugin and no script: you paste a link. First connect your shop at /integrator/connect (or with your agent: /integrator/agent-guide) and note your `<slug>`.

## Steps

1. Put markup A next to each product and markup B on the cart or checkout page.
2. Put markup C on the home page.
3. Machine markup (variant D) is optional: it is read by agents, not shown to visitors; see /integrator#options.
4. Optionally list the shop in your `llms.txt`: `AI agents can buy here: https://apibase.pro/m/<slug>/llms.txt`.

## The links

- A, button at a product: `https://apibase.pro/m/<slug>/p/<sku>`
- B, button at checkout: `https://apibase.pro/m/<slug>/cart?items=<sku>:1`
- C, "AI purchase" block on the home page: `https://apibase.pro/m/<slug>`

Use the link text "Buy with your AI agent". Ready-made markup for each: /integrator#options.

Menu names change between versions of the builder; the link itself does not. Check the result at `/integrator/check/<slug>`.
