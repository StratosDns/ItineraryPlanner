# Regenerate Supabase types and re-append convenience aliases
# Usage: .\scripts\gen-types.ps1

$project_id = "xqyuvwitlibbqeukqclp"
$out = "src/types/database.ts"

npx supabase gen types typescript --project-id $project_id | Out-File -FilePath $out -Encoding utf8

$aliases = @"

// ---------------------------------------------------------------------------
// Convenience aliases
// NOTE: This block is auto-appended by scripts/gen-types.ps1 after each regen.
// ---------------------------------------------------------------------------

export type Trip = Tables<'trips'>
export type Stop = Tables<'stops'>
export type StopAttachment = Tables<'stop_attachments'>
export type Cost = Tables<'costs'>
export type CostSplit = Tables<'cost_splits'>
export type FuelLog = Tables<'fuel_logs'>
export type Profile = Tables<'profiles'>

export type TripRole = 'owner' | 'editor' | 'viewer'
export type FuelType = 'gasoline' | 'diesel' | 'lpg' | 'electric' | 'other'
export type FuelUnit = 'L' | 'gal' | 'kWh'

export type TripMemberWithProfile = Tables<'trip_members'> & {
  profile: Profile | null
}
"@

Add-Content -Path $out -Value $aliases
Write-Host "Types regenerated and aliases appended to $out"
