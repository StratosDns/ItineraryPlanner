// Auto-maintained DB types — update when schema changes
// Run: npx supabase gen types typescript --project-id YOUR_PROJECT_ID > src/types/database.ts

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type FuelType = 'gasoline' | 'diesel' | 'lpg' | 'electric' | 'other'
export type FuelUnit = 'L' | 'gal' | 'kWh'
export type TripRole = 'owner' | 'editor' | 'viewer'

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          display_name: string | null
          avatar_url: string | null
          updated_at: string
        }
        Insert: {
          id: string
          display_name?: string | null
          avatar_url?: string | null
          updated_at?: string
        }
        Update: {
          id?: string
          display_name?: string | null
          avatar_url?: string | null
          updated_at?: string
        }
      }
      trips: {
        Row: {
          id: string
          title: string
          description: string | null
          owner_id: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          title: string
          description?: string | null
          owner_id: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          title?: string
          description?: string | null
          owner_id?: string
          created_at?: string
          updated_at?: string
        }
      }
      trip_members: {
        Row: {
          id: string
          trip_id: string
          user_id: string
          role: TripRole
          invited_by: string | null
          joined_at: string
        }
        Insert: {
          id?: string
          trip_id: string
          user_id: string
          role: TripRole
          invited_by?: string | null
          joined_at?: string
        }
        Update: {
          id?: string
          trip_id?: string
          user_id?: string
          role?: TripRole
          invited_by?: string | null
          joined_at?: string
        }
      }
      stops: {
        Row: {
          id: string
          trip_id: string
          order_index: number
          name: string
          address: string | null
          lat: number | null
          lng: number | null
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          trip_id: string
          order_index?: number
          name: string
          address?: string | null
          lat?: number | null
          lng?: number | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          trip_id?: string
          order_index?: number
          name?: string
          address?: string | null
          lat?: number | null
          lng?: number | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      stop_attachments: {
        Row: {
          id: string
          stop_id: string
          file_name: string
          file_url: string
          storage_path: string
          file_type: string | null
          label: string | null
          uploaded_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          stop_id: string
          file_name: string
          file_url: string
          storage_path: string
          file_type?: string | null
          label?: string | null
          uploaded_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          stop_id?: string
          file_name?: string
          file_url?: string
          storage_path?: string
          file_type?: string | null
          label?: string | null
          uploaded_by?: string | null
          created_at?: string
        }
      }
      fuel_logs: {
        Row: {
          id: string
          trip_id: string
          stop_id: string | null
          fuel_type: FuelType
          amount: number
          unit: FuelUnit
          cost: number
          currency: string
          odometer: number | null
          notes: string | null
          logged_by: string | null
          logged_at: string
        }
        Insert: {
          id?: string
          trip_id: string
          stop_id?: string | null
          fuel_type: FuelType
          amount: number
          unit?: FuelUnit
          cost: number
          currency?: string
          odometer?: number | null
          notes?: string | null
          logged_by?: string | null
          logged_at?: string
        }
        Update: {
          id?: string
          trip_id?: string
          stop_id?: string | null
          fuel_type?: FuelType
          amount?: number
          unit?: FuelUnit
          cost?: number
          currency?: string
          odometer?: number | null
          notes?: string | null
          logged_by?: string | null
          logged_at?: string
        }
      }
      costs: {
        Row: {
          id: string
          trip_id: string
          stop_id: string | null
          category: string
          description: string | null
          amount: number
          currency: string
          paid_by: string
          created_at: string
        }
        Insert: {
          id?: string
          trip_id: string
          stop_id?: string | null
          category?: string
          description?: string | null
          amount: number
          currency?: string
          paid_by: string
          created_at?: string
        }
        Update: {
          id?: string
          trip_id?: string
          stop_id?: string | null
          category?: string
          description?: string | null
          amount?: number
          currency?: string
          paid_by?: string
          created_at?: string
        }
      }
      cost_splits: {
        Row: {
          id: string
          cost_id: string
          user_id: string
          share_amount: number
          settled: boolean
          settled_at: string | null
        }
        Insert: {
          id?: string
          cost_id: string
          user_id: string
          share_amount: number
          settled?: boolean
          settled_at?: string | null
        }
        Update: {
          id?: string
          cost_id?: string
          user_id?: string
          share_amount?: number
          settled?: boolean
          settled_at?: string | null
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      my_trip_role: {
        Args: { trip: string }
        Returns: TripRole | null
      }
    }
    Enums: {
      [_ in never]: never
    }
  }
}

// Convenience row types
export type Profile = Database['public']['Tables']['profiles']['Row']
export type Trip = Database['public']['Tables']['trips']['Row']
export type TripMember = Database['public']['Tables']['trip_members']['Row']
export type Stop = Database['public']['Tables']['stops']['Row']
export type StopAttachment = Database['public']['Tables']['stop_attachments']['Row']
export type FuelLog = Database['public']['Tables']['fuel_logs']['Row']
export type Cost = Database['public']['Tables']['costs']['Row']
export type CostSplit = Database['public']['Tables']['cost_splits']['Row']

// Enriched types used in UI
export type TripMemberWithProfile = TripMember & { profile: Profile }
export type StopWithAttachments = Stop & { attachments: StopAttachment[] }
export type CostWithSplits = Cost & {
  splits: CostSplit[]
  payer_profile: Profile
}
export type FuelLogWithStop = FuelLog & { stop: Stop | null }
