export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      customers: {
        Row: {
          company: string | null
          created_at: string
          email: string
          id: string
          name: string
          notes: string | null
        }
        Insert: {
          company?: string | null
          created_at?: string
          email: string
          id?: string
          name: string
          notes?: string | null
        }
        Update: {
          company?: string | null
          created_at?: string
          email?: string
          id?: string
          name?: string
          notes?: string | null
        }
        Relationships: []
      }
      data_source_rows: {
        Row: {
          created_at: string
          data_source_id: string
          id: string
          row_index: number
          values: Json
        }
        Insert: {
          created_at?: string
          data_source_id: string
          id?: string
          row_index: number
          values?: Json
        }
        Update: {
          created_at?: string
          data_source_id?: string
          id?: string
          row_index?: number
          values?: Json
        }
        Relationships: [
          {
            foreignKeyName: "data_source_rows_data_source_id_fkey"
            columns: ["data_source_id"]
            isOneToOne: false
            referencedRelation: "data_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      data_sources: {
        Row: {
          columns: string[]
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          columns?: string[]
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          columns?: string[]
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      fleet_events: {
        Row: {
          event_type: string
          id: string
          message: string
          metadata: Json | null
          occurred_at: string
          printer_id: string
          severity: string
        }
        Insert: {
          event_type: string
          id?: string
          message: string
          metadata?: Json | null
          occurred_at?: string
          printer_id: string
          severity?: string
        }
        Update: {
          event_type?: string
          id?: string
          message?: string
          metadata?: Json | null
          occurred_at?: string
          printer_id?: string
          severity?: string
        }
        Relationships: [
          {
            foreignKeyName: "fleet_events_printer_id_fkey"
            columns: ["printer_id"]
            isOneToOne: false
            referencedRelation: "fleet_printers"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_firmware: {
        Row: {
          created_at: string
          file_size: number | null
          id: string
          is_latest: boolean | null
          release_notes: string | null
          version: string
        }
        Insert: {
          created_at?: string
          file_size?: number | null
          id?: string
          is_latest?: boolean | null
          release_notes?: string | null
          version: string
        }
        Update: {
          created_at?: string
          file_size?: number | null
          id?: string
          is_latest?: boolean | null
          release_notes?: string | null
          version?: string
        }
        Relationships: []
      }
      fleet_firmware_updates: {
        Row: {
          completed_at: string | null
          created_at: string
          error_message: string | null
          firmware_id: string
          id: string
          printer_id: string
          progress: number | null
          started_at: string | null
          status: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          firmware_id: string
          id?: string
          printer_id: string
          progress?: number | null
          started_at?: string | null
          status?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          firmware_id?: string
          id?: string
          printer_id?: string
          progress?: number | null
          started_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "fleet_firmware_updates_firmware_id_fkey"
            columns: ["firmware_id"]
            isOneToOne: false
            referencedRelation: "fleet_firmware"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_firmware_updates_printer_id_fkey"
            columns: ["printer_id"]
            isOneToOne: false
            referencedRelation: "fleet_printers"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_printers: {
        Row: {
          created_at: string
          firmware_version: string | null
          id: string
          ip_address: string
          last_seen: string | null
          name: string
          port: number
          serial_number: string | null
          site_id: string
          status: string
        }
        Insert: {
          created_at?: string
          firmware_version?: string | null
          id?: string
          ip_address: string
          last_seen?: string | null
          name: string
          port?: number
          serial_number?: string | null
          site_id: string
          status?: string
        }
        Update: {
          created_at?: string
          firmware_version?: string | null
          id?: string
          ip_address?: string
          last_seen?: string | null
          name?: string
          port?: number
          serial_number?: string | null
          site_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "fleet_printers_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "fleet_sites"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_sites: {
        Row: {
          company: string | null
          contact_email: string | null
          created_at: string
          id: string
          license_id: string | null
          location: string | null
          name: string
          updated_at: string
        }
        Insert: {
          company?: string | null
          contact_email?: string | null
          created_at?: string
          id?: string
          license_id?: string | null
          location?: string | null
          name: string
          updated_at?: string
        }
        Update: {
          company?: string | null
          contact_email?: string | null
          created_at?: string
          id?: string
          license_id?: string | null
          location?: string | null
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fleet_sites_license_id_fkey"
            columns: ["license_id"]
            isOneToOne: false
            referencedRelation: "licenses"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_telemetry: {
        Row: {
          charge: number | null
          current_message: string | null
          electronics_temp: number | null
          hv_on: boolean | null
          id: string
          ink_level: string | null
          jet_running: boolean | null
          makeup_level: string | null
          modulation: number | null
          phase_qual: number | null
          power_hours: string | null
          pressure: number | null
          print_count: number | null
          printer_id: string
          printhead_temp: number | null
          recorded_at: string
          rps: number | null
          stream_hours: string | null
          viscosity: number | null
        }
        Insert: {
          charge?: number | null
          current_message?: string | null
          electronics_temp?: number | null
          hv_on?: boolean | null
          id?: string
          ink_level?: string | null
          jet_running?: boolean | null
          makeup_level?: string | null
          modulation?: number | null
          phase_qual?: number | null
          power_hours?: string | null
          pressure?: number | null
          print_count?: number | null
          printer_id: string
          printhead_temp?: number | null
          recorded_at?: string
          rps?: number | null
          stream_hours?: string | null
          viscosity?: number | null
        }
        Update: {
          charge?: number | null
          current_message?: string | null
          electronics_temp?: number | null
          hv_on?: boolean | null
          id?: string
          ink_level?: string | null
          jet_running?: boolean | null
          makeup_level?: string | null
          modulation?: number | null
          phase_qual?: number | null
          power_hours?: string | null
          pressure?: number | null
          print_count?: number | null
          printer_id?: string
          printhead_temp?: number | null
          recorded_at?: string
          rps?: number | null
          stream_hours?: string | null
          viscosity?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fleet_telemetry_printer_id_fkey"
            columns: ["printer_id"]
            isOneToOne: false
            referencedRelation: "fleet_printers"
            referencedColumns: ["id"]
          },
        ]
      }
      license_activations: {
        Row: {
          activated_at: string
          id: string
          is_current: boolean
          last_seen: string
          license_id: string
          machine_id: string
        }
        Insert: {
          activated_at?: string
          id?: string
          is_current?: boolean
          last_seen?: string
          license_id: string
          machine_id: string
        }
        Update: {
          activated_at?: string
          id?: string
          is_current?: boolean
          last_seen?: string
          license_id?: string
          machine_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "license_activations_license_id_fkey"
            columns: ["license_id"]
            isOneToOne: false
            referencedRelation: "licenses"
            referencedColumns: ["id"]
          },
        ]
      }
      licenses: {
        Row: {
          created_at: string
          customer_id: string | null
          expires_at: string | null
          id: string
          is_active: boolean
          product_key: string
          tier: Database["public"]["Enums"]["license_tier"]
        }
        Insert: {
          created_at?: string
          customer_id?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          product_key: string
          tier?: Database["public"]["Enums"]["license_tier"]
        }
        Update: {
          created_at?: string
          customer_id?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          product_key?: string
          tier?: Database["public"]["Enums"]["license_tier"]
        }
        Relationships: [
          {
            foreignKeyName: "licenses_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      print_jobs: {
        Row: {
          created_at: string
          current_row_index: number
          data_source_id: string
          field_mappings: Json
          id: string
          message_name: string
          printer_id: number
          status: string
          total_rows: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_row_index?: number
          data_source_id: string
          field_mappings?: Json
          id?: string
          message_name: string
          printer_id: number
          status?: string
          total_rows?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_row_index?: number
          data_source_id?: string
          field_mappings?: Json
          id?: string
          message_name?: string
          printer_id?: number
          status?: string
          total_rows?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "print_jobs_data_source_id_fkey"
            columns: ["data_source_id"]
            isOneToOne: false
            referencedRelation: "data_sources"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      license_tier: "lite" | "full" | "database" | "demo"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      license_tier: ["lite", "full", "database", "demo"],
    },
  },
} as const
