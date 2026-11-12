-- T-0802 (SELLER-LIVE-1112 ruling-3): a partner handoff that asked for the grant is signed once.
-- One message states the encryption key, the registration, the four documents and the partner's
-- permission; each record keeps that message and its signature as its proof. The encryption key
-- keeps it inside its JSON (`signed_message`); shop_acceptances already holds message + signature.
-- Registration and grant had no proof column: these are added, NULL for every existing row (and for
-- registrations and grants made by the per-purpose routes, which are unchanged).
ALTER TABLE shop_merchants
    ADD COLUMN register_message text NULL,
    ADD COLUMN register_signature text NULL;
ALTER TABLE shop_partner_grants
    ADD COLUMN proof_message text NULL,
    ADD COLUMN proof_signature text NULL;
