-- "קישור ביט אישי": an optional personal Bit link next to the phone for Bit.
-- Every Bit user's personal QR code holds a link like
-- https://www.bitpay.co.il/app/me/<ID>; opening it opens Bit straight on
-- "transfer to <name>". A payer's button then copies the amount and opens it.
--
-- Stored exactly like the phone: in the same private table
-- (public.profile_phones), so the same rules apply to it, unchanged:
--   - readable only by its owner and by a user who has to transfer money to
--     its owner (a stored transfer of a closed table, not all cash, not marked
--     paid, while the settling is open: private.pays_by_transfer_to);
--   - written only by its owner; never in the change log (no trigger writes
--     it), the invite or the share image.
-- A row may now hold a phone, a link, or both (never neither).
--
-- Additive: the live version reads `phone` only, and a row with a link but no
-- phone simply shows it no phone (as before for someone without a number).

alter table public.profile_phones
  alter column phone drop not null,
  add column bit_link text
    constraint profile_bit_link check (bit_link ~ '^https://www\.bitpay\.co\.il/app/me/[A-Za-z0-9._~-]{1,200}$'),
  add constraint profile_phones_something check (phone is not null or bit_link is not null);

comment on column public.profile_phones.bit_link is
  'Personal Bit link (https://www.bitpay.co.il/app/me/<ID>), same privacy as the phone';

grant insert (bit_link) on public.profile_phones to authenticated;
grant update (bit_link) on public.profile_phones to authenticated;
