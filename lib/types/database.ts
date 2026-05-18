export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      orgs: {
        Row: {
          id: string
          name: string
          slug: string
          plan_tier: 'starter' | 'team' | 'agency'
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          settings: Json
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          slug: string
          plan_tier?: 'starter' | 'team' | 'agency'
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          settings?: Json
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          slug?: string
          plan_tier?: 'starter' | 'team' | 'agency'
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          settings?: Json
          created_at?: string
        }
      }
      org_members: {
        Row: {
          id: string
          org_id: string
          user_id: string | null
          role: 'owner' | 'admin' | 'member'
          invited_email: string | null
          invite_token: string | null
          joined_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          org_id: string
          user_id?: string | null
          role?: 'owner' | 'admin' | 'member'
          invited_email?: string | null
          invite_token?: string | null
          joined_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          user_id?: string | null
          role?: 'owner' | 'admin' | 'member'
          invited_email?: string | null
          invite_token?: string | null
          joined_at?: string | null
          created_at?: string
        }
      }
      resources: {
        Row: {
          id: string
          org_id: string
          name: string
          email: string | null
          avatar_url: string | null
          icon_type: 'person' | 'room' | 'equipment'
          working_week: Json
          created_at: string
        }
        Insert: {
          id?: string
          org_id: string
          name: string
          email?: string | null
          avatar_url?: string | null
          icon_type?: 'person' | 'room' | 'equipment'
          working_week?: Json
          created_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          name?: string
          email?: string | null
          avatar_url?: string | null
          icon_type?: 'person' | 'room' | 'equipment'
          working_week?: Json
          created_at?: string
        }
      }
      projects: {
        Row: {
          id: string
          org_id: string
          name: string
          color: string
          description: string | null
          created_at: string
        }
        Insert: {
          id?: string
          org_id: string
          name: string
          color?: string
          description?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          name?: string
          color?: string
          description?: string | null
          created_at?: string
        }
      }
      tags: {
        Row: {
          id: string
          org_id: string
          name: string
          color: string
        }
        Insert: {
          id?: string
          org_id: string
          name: string
          color?: string
        }
        Update: {
          id?: string
          org_id?: string
          name?: string
          color?: string
        }
      }
      tasks: {
        Row: {
          id: string
          org_id: string
          resource_id: string
          project_id: string | null
          name: string
          type: 'fixed' | 'fluid'
          status: 'pending' | 'in_progress' | 'completed'
          start_date: string
          end_date: string
          duration_hours: number
          actual_duration_hours: number | null
          position: number | null
          task_group_id: string | null
          segment_index: number | null
          constraints: Json
          tags: string[]
          external_ref: Json | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          org_id: string
          resource_id: string
          project_id?: string | null
          name: string
          type: 'fixed' | 'fluid'
          status?: 'pending' | 'in_progress' | 'completed'
          start_date: string
          end_date: string
          duration_hours: number
          actual_duration_hours?: number | null
          position?: number | null
          task_group_id?: string | null
          segment_index?: number | null
          constraints?: Json
          tags?: string[]
          external_ref?: Json | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          resource_id?: string
          project_id?: string | null
          name?: string
          type?: 'fixed' | 'fluid'
          status?: 'pending' | 'in_progress' | 'completed'
          start_date?: string
          end_date?: string
          duration_hours?: number
          actual_duration_hours?: number | null
          position?: number | null
          task_group_id?: string | null
          segment_index?: number | null
          constraints?: Json
          tags?: string[]
          external_ref?: Json | null
          created_at?: string
          updated_at?: string
        }
      }
      operation_log: {
        Row: {
          id: string
          org_id: string
          resource_id: string | null
          operation_type: string
          payload: Json
          client_id: string | null
          applied_at: string
        }
        Insert: {
          id?: string
          org_id: string
          resource_id?: string | null
          operation_type: string
          payload?: Json
          client_id?: string | null
          applied_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          resource_id?: string | null
          operation_type?: string
          payload?: Json
          client_id?: string | null
          applied_at?: string
        }
      }
      integration_tokens: {
        Row: {
          id: string
          org_id: string
          member_id: string
          provider: 'google_calendar' | 'outlook' | 'slack' | 'github' | 'linear'
          access_token: string
          refresh_token: string | null
          expires_at: string | null
          settings: Json
          created_at: string
        }
        Insert: {
          id?: string
          org_id: string
          member_id: string
          provider: 'google_calendar' | 'outlook' | 'slack' | 'github' | 'linear'
          access_token: string
          refresh_token?: string | null
          expires_at?: string | null
          settings?: Json
          created_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          member_id?: string
          provider?: 'google_calendar' | 'outlook' | 'slack' | 'github' | 'linear'
          access_token?: string
          refresh_token?: string | null
          expires_at?: string | null
          settings?: Json
          created_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_org_member: {
        Args: { p_org_id: string }
        Returns: boolean
      }
      is_org_admin: {
        Args: { p_org_id: string }
        Returns: boolean
      }
    }
    Enums: {
      [_ in never]: never
    }
  }
}
