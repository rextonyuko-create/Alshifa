# ALS Supabase Setup

This project keeps the existing booking form and dashboard UI intact.

## Booking form field mapping

- `name` -> `als_appointments.full_name`
- `phone` -> `als_appointments.phone`
- `test` -> `als_appointments.test_name`
- `date` -> `als_appointments.appointment_date`
- `slot` -> `als_appointments.time_slot`
- `collection` -> `als_appointments.collection_type`
- generated booking code -> `als_appointments.booking_id`

## Tables

- `als_appointments`
- `als_reports`
- `als_staff_profiles`
- `als_audit_logs`

## Next step

After applying `supabase/als_schema.sql`, set these environment variables in the API runtime:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

The `SUPABASE_KEY` fallback is still supported for local testing, but the service role key is the preferred production setup for server-side API routes.
