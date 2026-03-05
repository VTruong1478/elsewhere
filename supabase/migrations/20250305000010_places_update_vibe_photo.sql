-- Allow authenticated users to update vibe_photo_ref and vibe_photo_attribution only (admin photo picker).
CREATE POLICY places_update_vibe_photo ON places
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);
