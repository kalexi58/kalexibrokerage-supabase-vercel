-- Ensure these storage buckets exist explicitly, including when already provisioned.
INSERT INTO storage.buckets (id, name, public)
VALUES ('kalexi-vault', 'kalexi-vault', false),
       ('kalexi-avatars', 'kalexi-avatars', false)
ON CONFLICT (id) DO NOTHING;
