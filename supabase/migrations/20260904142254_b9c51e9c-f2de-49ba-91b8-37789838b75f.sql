CREATE POLICY "No direct client access to firmware packages"
ON public.firmware_packages
AS RESTRICTIVE
FOR ALL
TO anon, authenticated
USING (false)
WITH CHECK (false);