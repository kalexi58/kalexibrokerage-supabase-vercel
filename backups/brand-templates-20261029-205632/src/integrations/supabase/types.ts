export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15";
  };
  public: {
    Tables: {
      company_branding: {
        Row: {
          accent_color: string;
          id: string;
          logo_path: string | null;
          primary_color: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          accent_color?: string;
          id?: string;
          logo_path?: string | null;
          primary_color?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          accent_color?: string;
          id?: string;
          logo_path?: string | null;
          primary_color?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      system_maintenance: {
        Row: {
          estimated_completion_time: string | null;
          id: string;
          maintenance_enabled: boolean;
          maintenance_message: string | null;
          maintenance_start_time: string | null;
          maintenance_updated_at: string;
          maintenance_updated_by: string | null;
        };
        Insert: {
          estimated_completion_time?: string | null;
          id: string;
          maintenance_enabled?: boolean;
          maintenance_message?: string | null;
          maintenance_start_time?: string | null;
          maintenance_updated_at?: string;
          maintenance_updated_by?: string | null;
        };
        Update: {
          estimated_completion_time?: string | null;
          id?: string;
          maintenance_enabled?: boolean;
          maintenance_message?: string | null;
          maintenance_start_time?: string | null;
          maintenance_updated_at?: string;
          maintenance_updated_by?: string | null;
        };
        Relationships: [];
      };
      agent_applications: {
        Row: {
          address: string | null;
          application_ref: string;
          campaign_id: string | null;
          created_at: string;
          date_of_birth: string | null;
          declarations: Json;
          district: string | null;
          email: string;
          full_name: string;
          gender: string | null;
          id: string;
          id_back_path: string | null;
          id_front_path: string | null;
          id_number: string;
          id_type: string;
          nationality: string | null;
          occupation: string | null;
          payment_account_name: string | null;
          payment_account_number: string | null;
          payment_method: string;
          payment_provider: string | null;
          phone: string;
          photo_path: string | null;
          registry_id: string | null;
          review_note: string | null;
          reviewed_at: string | null;
          reviewed_by: string | null;
          status: string;
          updated_at: string;
          user_id: string | null;
          village: string | null;
        };
        Insert: {
          address?: string | null;
          application_ref?: string;
          campaign_id?: string | null;
          created_at?: string;
          date_of_birth?: string | null;
          declarations?: Json;
          district?: string | null;
          email: string;
          full_name: string;
          gender?: string | null;
          id?: string;
          id_back_path?: string | null;
          id_front_path?: string | null;
          id_number: string;
          id_type: string;
          nationality?: string | null;
          occupation?: string | null;
          payment_account_name?: string | null;
          payment_account_number?: string | null;
          payment_method: string;
          payment_provider?: string | null;
          phone: string;
          photo_path?: string | null;
          registry_id?: string | null;
          review_note?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: string;
          updated_at?: string;
          user_id?: string | null;
          village?: string | null;
        };
        Update: {
          address?: string | null;
          application_ref?: string;
          campaign_id?: string | null;
          created_at?: string;
          date_of_birth?: string | null;
          declarations?: Json;
          district?: string | null;
          email?: string;
          full_name?: string;
          gender?: string | null;
          id?: string;
          id_back_path?: string | null;
          id_front_path?: string | null;
          id_number?: string;
          id_type?: string;
          nationality?: string | null;
          occupation?: string | null;
          payment_account_name?: string | null;
          payment_account_number?: string | null;
          payment_method?: string;
          payment_provider?: string | null;
          phone?: string;
          photo_path?: string | null;
          registry_id?: string | null;
          review_note?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: string;
          updated_at?: string;
          user_id?: string | null;
          village?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "agent_applications_campaign_id_fkey";
            columns: ["campaign_id"];
            isOneToOne: false;
            referencedRelation: "agent_campaigns";
            referencedColumns: ["id"];
          },
        ];
      };
      agent_campaigns: {
        Row: {
          active: boolean;
          created_at: string;
          created_by: string | null;
          expires_at: string | null;
          id: string;
          title: string;
          token: string;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          created_by?: string | null;
          expires_at?: string | null;
          id?: string;
          title: string;
          token?: string;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          created_by?: string | null;
          expires_at?: string | null;
          id?: string;
          title?: string;
          token?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      agent_messages: {
        Row: {
          attachments: Json;
          body: string;
          created_at: string;
          id: string;
          owner_user_id: string;
          sender_id: string;
        };
        Insert: {
          attachments?: Json;
          body?: string;
          created_at?: string;
          id?: string;
          owner_user_id: string;
          sender_id: string;
        };
        Update: {
          attachments?: Json;
          body?: string;
          created_at?: string;
          id?: string;
          owner_user_id?: string;
          sender_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "agent_messages_owner_user_id_fkey";
            columns: ["owner_user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "agent_messages_sender_id_fkey";
            columns: ["sender_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      agent_notices: {
        Row: {
          body: string;
          created_at: string;
          created_by: string | null;
          id: string;
          title: string;
        };
        Insert: {
          body: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          title: string;
        };
        Update: {
          body?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          title?: string;
        };
        Relationships: [];
      };
      agent_redemptions: {
        Row: {
          agent_id: string;
          amount: number;
          created_at: string;
          currency: string;
          id: string;
          processed_at: string | null;
          processed_by: string | null;
          status: string;
          tokens_used: number;
        };
        Insert: {
          agent_id: string;
          amount?: number;
          created_at?: string;
          currency?: string;
          id?: string;
          processed_at?: string | null;
          processed_by?: string | null;
          status?: string;
          tokens_used: number;
        };
        Update: {
          agent_id?: string;
          amount?: number;
          created_at?: string;
          currency?: string;
          id?: string;
          processed_at?: string | null;
          processed_by?: string | null;
          status?: string;
          tokens_used?: number;
        };
        Relationships: [
          {
            foreignKeyName: "agent_redemptions_agent_id_fkey";
            columns: ["agent_id"];
            isOneToOne: false;
            referencedRelation: "agents";
            referencedColumns: ["id"];
          },
        ];
      };
      agent_registry: {
        Row: {
          created_at: string;
          created_by: string | null;
          district: string | null;
          full_name: string;
          id: string;
          linked_application_id: string | null;
          phone: string | null;
          received_by: string | null;
          reg_id: string;
          registered_on: string | null;
          signature_path: string | null;
          status: string;
          updated_at: string;
          village: string | null;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          district?: string | null;
          full_name: string;
          id?: string;
          linked_application_id?: string | null;
          phone?: string | null;
          received_by?: string | null;
          reg_id: string;
          registered_on?: string | null;
          signature_path?: string | null;
          status?: string;
          updated_at?: string;
          village?: string | null;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          district?: string | null;
          full_name?: string;
          id?: string;
          linked_application_id?: string | null;
          phone?: string | null;
          received_by?: string | null;
          reg_id?: string;
          registered_on?: string | null;
          signature_path?: string | null;
          status?: string;
          updated_at?: string;
          village?: string | null;
        };
        Relationships: [];
      };
      agents: {
        Row: {
          agent_code: string;
          application_id: string | null;
          commission_rate: number;
          company_phone: string | null;
          created_at: string;
          created_by: string | null;
          designation: string;
          district: string | null;
          email: string;
          expires_at: string;
          full_name: string;
          id: string;
          issued_at: string;
          phone: string;
          photo_path: string | null;
          referral_code: string;
          registry_id: string | null;
          signature_path: string | null;
          status: string;
          updated_at: string;
          user_id: string | null;
          verification_token: string;
          village: string | null;
        };
        Insert: {
          agent_code?: string;
          application_id?: string | null;
          commission_rate?: number;
          company_phone?: string | null;
          created_at?: string;
          created_by?: string | null;
          designation?: string;
          district?: string | null;
          email: string;
          expires_at?: string;
          full_name: string;
          id?: string;
          issued_at?: string;
          phone: string;
          photo_path?: string | null;
          referral_code?: string;
          registry_id?: string | null;
          signature_path?: string | null;
          status?: string;
          updated_at?: string;
          user_id?: string | null;
          verification_token?: string;
          village?: string | null;
        };
        Update: {
          agent_code?: string;
          application_id?: string | null;
          commission_rate?: number;
          company_phone?: string | null;
          created_at?: string;
          created_by?: string | null;
          designation?: string;
          district?: string | null;
          email?: string;
          expires_at?: string;
          full_name?: string;
          id?: string;
          issued_at?: string;
          phone?: string;
          photo_path?: string | null;
          referral_code?: string;
          registry_id?: string | null;
          signature_path?: string | null;
          status?: string;
          updated_at?: string;
          user_id?: string | null;
          verification_token?: string;
          village?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "agents_application_id_fkey";
            columns: ["application_id"];
            isOneToOne: true;
            referencedRelation: "agent_applications";
            referencedColumns: ["id"];
          },
        ];
      };
      archive_records: {
        Row: {
          archived_at: string;
          archived_by: string | null;
          created_at: string;
          created_by: string | null;
          entity_id: string;
          entity_ref: string | null;
          entity_type: string;
          id: string;
          original_created_at: string | null;
          original_created_by: string | null;
          previous_status: string | null;
          reason: string | null;
          restore_reason: string | null;
          restored_at: string | null;
          restored_by: string | null;
          snapshot: Json | null;
          state: string;
          title: string | null;
          updated_at: string;
        };
        Insert: {
          archived_at?: string;
          archived_by?: string | null;
          created_at?: string;
          created_by?: string | null;
          entity_id: string;
          entity_ref?: string | null;
          entity_type: string;
          id?: string;
          original_created_at?: string | null;
          original_created_by?: string | null;
          previous_status?: string | null;
          reason?: string | null;
          restore_reason?: string | null;
          restored_at?: string | null;
          restored_by?: string | null;
          snapshot?: Json | null;
          state?: string;
          title?: string | null;
          updated_at?: string;
        };
        Update: {
          archived_at?: string;
          archived_by?: string | null;
          created_at?: string;
          created_by?: string | null;
          entity_id?: string;
          entity_ref?: string | null;
          entity_type?: string;
          id?: string;
          original_created_at?: string | null;
          original_created_by?: string | null;
          previous_status?: string | null;
          reason?: string | null;
          restore_reason?: string | null;
          restored_at?: string | null;
          restored_by?: string | null;
          snapshot?: Json | null;
          state?: string;
          title?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      audit_logs: {
        Row: {
          action: string;
          actor_email: string | null;
          actor_id: string | null;
          created_at: string;
          entity_id: string | null;
          entity_type: string | null;
          id: string;
          metadata: Json | null;
          new_value: Json | null;
          previous_value: Json | null;
        };
        Insert: {
          action: string;
          actor_email?: string | null;
          actor_id?: string | null;
          created_at?: string;
          entity_id?: string | null;
          entity_type?: string | null;
          id?: string;
          metadata?: Json | null;
          new_value?: Json | null;
          previous_value?: Json | null;
        };
        Update: {
          action?: string;
          actor_email?: string | null;
          actor_id?: string | null;
          created_at?: string;
          entity_id?: string | null;
          entity_type?: string | null;
          id?: string;
          metadata?: Json | null;
          new_value?: Json | null;
          previous_value?: Json | null;
        };
        Relationships: [];
      };
      brand_templates: {
        Row: {
          accent: string;
          body: string | null;
          created_at: string;
          created_by: string | null;
          doc_date: string | null;
          heading: string | null;
          id: string;
          kind: string;
          name: string;
          signatory_name: string | null;
          signatory_title: string | null;
          signature_path: string | null;
          updated_at: string;
        };
        Insert: {
          accent?: string;
          body?: string | null;
          created_at?: string;
          created_by?: string | null;
          doc_date?: string | null;
          heading?: string | null;
          id?: string;
          kind?: string;
          name: string;
          signatory_name?: string | null;
          signatory_title?: string | null;
          signature_path?: string | null;
          updated_at?: string;
        };
        Update: {
          accent?: string;
          body?: string | null;
          created_at?: string;
          created_by?: string | null;
          doc_date?: string | null;
          heading?: string | null;
          id?: string;
          kind?: string;
          name?: string;
          signatory_name?: string | null;
          signatory_title?: string | null;
          signature_path?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      client_requirements: {
        Row: {
          archive_reason: string | null;
          archived_at: string | null;
          archived_by: string | null;
          budget_max: number | null;
          budget_min: number | null;
          client_id: string;
          created_at: string;
          created_by: string | null;
          currency: string;
          deadline: string | null;
          description: string | null;
          id: string;
          location: string | null;
          priority: string;
          quantity: string | null;
          requirement_ref: string;
          sector: string;
          specifications: string | null;
          status: string;
          title: string;
          updated_at: string;
        };
        Insert: {
          archive_reason?: string | null;
          archived_at?: string | null;
          archived_by?: string | null;
          budget_max?: number | null;
          budget_min?: number | null;
          client_id: string;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          deadline?: string | null;
          description?: string | null;
          id?: string;
          location?: string | null;
          priority?: string;
          quantity?: string | null;
          requirement_ref?: string;
          sector: string;
          specifications?: string | null;
          status?: string;
          title: string;
          updated_at?: string;
        };
        Update: {
          archive_reason?: string | null;
          archived_at?: string | null;
          archived_by?: string | null;
          budget_max?: number | null;
          budget_min?: number | null;
          client_id?: string;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          deadline?: string | null;
          description?: string | null;
          id?: string;
          location?: string | null;
          priority?: string;
          quantity?: string | null;
          requirement_ref?: string;
          sector?: string;
          specifications?: string | null;
          status?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "client_requirements_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
        ];
      };
      clients: {
        Row: {
          address: string | null;
          agent_id: string | null;
          archive_reason: string | null;
          archived_at: string | null;
          archived_by: string | null;
          branch: string | null;
          client_ref: string;
          client_type: string;
          company_name: string | null;
          created_at: string;
          email: string | null;
          full_name: string;
          id: string;
          id_number: string | null;
          id_type: string | null;
          kyc_details: Json;
          kyc_status: string;
          legal_name: string | null;
          phone: string;
          referral_code: string | null;
          registered_by: string | null;
          requirement: string;
          sector: string;
          status: string;
          updated_at: string;
          verification_ref: string;
        };
        Insert: {
          address?: string | null;
          agent_id?: string | null;
          archive_reason?: string | null;
          archived_at?: string | null;
          archived_by?: string | null;
          branch?: string | null;
          client_ref?: string;
          client_type: string;
          company_name?: string | null;
          created_at?: string;
          email?: string | null;
          full_name: string;
          id?: string;
          id_number?: string | null;
          id_type?: string | null;
          kyc_details?: Json;
          kyc_status?: string;
          legal_name?: string | null;
          phone: string;
          referral_code?: string | null;
          registered_by?: string | null;
          requirement: string;
          sector: string;
          status?: string;
          updated_at?: string;
          verification_ref?: string;
        };
        Update: {
          address?: string | null;
          agent_id?: string | null;
          archive_reason?: string | null;
          archived_at?: string | null;
          archived_by?: string | null;
          branch?: string | null;
          client_ref?: string;
          client_type?: string;
          company_name?: string | null;
          created_at?: string;
          email?: string | null;
          full_name?: string;
          id?: string;
          id_number?: string | null;
          id_type?: string | null;
          kyc_details?: Json;
          kyc_status?: string;
          legal_name?: string | null;
          phone?: string;
          referral_code?: string | null;
          registered_by?: string | null;
          requirement?: string;
          sector?: string;
          status?: string;
          updated_at?: string;
          verification_ref?: string;
        };
        Relationships: [
          {
            foreignKeyName: "clients_agent_id_fkey";
            columns: ["agent_id"];
            isOneToOne: false;
            referencedRelation: "agents";
            referencedColumns: ["id"];
          },
        ];
      };
      commissions: {
        Row: {
          amount: number;
          archive_reason: string | null;
          archived_at: string | null;
          archived_by: string | null;
          beneficiary: string | null;
          created_at: string;
          created_by: string | null;
          currency: string;
          deal_id: string;
          id: string;
          narrative: string | null;
          rate: number | null;
          status: string;
          transaction_id: string | null;
          updated_at: string;
        };
        Insert: {
          amount: number;
          archive_reason?: string | null;
          archived_at?: string | null;
          archived_by?: string | null;
          beneficiary?: string | null;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          deal_id: string;
          id?: string;
          narrative?: string | null;
          rate?: number | null;
          status?: string;
          transaction_id?: string | null;
          updated_at?: string;
        };
        Update: {
          amount?: number;
          archive_reason?: string | null;
          archived_at?: string | null;
          archived_by?: string | null;
          beneficiary?: string | null;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          deal_id?: string;
          id?: string;
          narrative?: string | null;
          rate?: number | null;
          status?: string;
          transaction_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "commissions_deal_id_fkey";
            columns: ["deal_id"];
            isOneToOne: false;
            referencedRelation: "deals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "commissions_transaction_id_fkey";
            columns: ["transaction_id"];
            isOneToOne: false;
            referencedRelation: "transactions";
            referencedColumns: ["id"];
          },
        ];
      };
      communications: {
        Row: {
          archive_reason: string | null;
          archived_at: string | null;
          archived_by: string | null;
          body: string;
          channel: string;
          client_id: string | null;
          created_at: string;
          created_by: string | null;
          deal_id: string | null;
          id: string;
          occurred_at: string;
          status: string;
          subject: string | null;
          updated_at: string;
        };
        Insert: {
          archive_reason?: string | null;
          archived_at?: string | null;
          archived_by?: string | null;
          body: string;
          channel?: string;
          client_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          deal_id?: string | null;
          id?: string;
          occurred_at?: string;
          status?: string;
          subject?: string | null;
          updated_at?: string;
        };
        Update: {
          archive_reason?: string | null;
          archived_at?: string | null;
          archived_by?: string | null;
          body?: string;
          channel?: string;
          client_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          deal_id?: string | null;
          id?: string;
          occurred_at?: string;
          status?: string;
          subject?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "communications_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
        ];
      };
      companies: {
        Row: {
          address: string | null;
          archive_reason: string | null;
          archived_at: string | null;
          archived_by: string | null;
          beneficial_owners: Json;
          client_id: string | null;
          company_ref: string;
          country: string | null;
          created_at: string;
          created_by: string | null;
          directors: Json;
          id: string;
          name: string;
          notes: string | null;
          registration_number: string | null;
          representatives: Json;
          status: string;
          updated_at: string;
        };
        Insert: {
          address?: string | null;
          archive_reason?: string | null;
          archived_at?: string | null;
          archived_by?: string | null;
          beneficial_owners?: Json;
          client_id?: string | null;
          company_ref?: string;
          country?: string | null;
          created_at?: string;
          created_by?: string | null;
          directors?: Json;
          id?: string;
          name: string;
          notes?: string | null;
          registration_number?: string | null;
          representatives?: Json;
          status?: string;
          updated_at?: string;
        };
        Update: {
          address?: string | null;
          archive_reason?: string | null;
          archived_at?: string | null;
          archived_by?: string | null;
          beneficial_owners?: Json;
          client_id?: string | null;
          company_ref?: string;
          country?: string | null;
          created_at?: string;
          created_by?: string | null;
          directors?: Json;
          id?: string;
          name?: string;
          notes?: string | null;
          registration_number?: string | null;
          representatives?: Json;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "companies_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
        ];
      };
      contacts: {
        Row: {
          archive_reason: string | null;
          archived_at: string | null;
          archived_by: string | null;
          client_id: string | null;
          company_id: string | null;
          created_at: string;
          created_by: string | null;
          email: string | null;
          full_name: string;
          id: string;
          notes: string | null;
          phone: string | null;
          role: string | null;
          status: string;
          updated_at: string;
        };
        Insert: {
          archive_reason?: string | null;
          archived_at?: string | null;
          archived_by?: string | null;
          client_id?: string | null;
          company_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          email?: string | null;
          full_name: string;
          id?: string;
          notes?: string | null;
          phone?: string | null;
          role?: string | null;
          status?: string;
          updated_at?: string;
        };
        Update: {
          archive_reason?: string | null;
          archived_at?: string | null;
          archived_by?: string | null;
          client_id?: string | null;
          company_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          email?: string | null;
          full_name?: string;
          id?: string;
          notes?: string | null;
          phone?: string | null;
          role?: string | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "contacts_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "contacts_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      deal_parties: {
        Row: {
          archive_reason: string | null;
          archived_at: string | null;
          archived_by: string | null;
          client_id: string | null;
          company_id: string | null;
          contact: string | null;
          created_at: string;
          created_by: string | null;
          deal_id: string;
          id: string;
          name: string;
          notes: string | null;
          party_role: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          archive_reason?: string | null;
          archived_at?: string | null;
          archived_by?: string | null;
          client_id?: string | null;
          company_id?: string | null;
          contact?: string | null;
          created_at?: string;
          created_by?: string | null;
          deal_id: string;
          id?: string;
          name: string;
          notes?: string | null;
          party_role: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          archive_reason?: string | null;
          archived_at?: string | null;
          archived_by?: string | null;
          client_id?: string | null;
          company_id?: string | null;
          contact?: string | null;
          created_at?: string;
          created_by?: string | null;
          deal_id?: string;
          id?: string;
          name?: string;
          notes?: string | null;
          party_role?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "deal_parties_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "deal_parties_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "deal_parties_deal_id_fkey";
            columns: ["deal_id"];
            isOneToOne: false;
            referencedRelation: "deals";
            referencedColumns: ["id"];
          },
        ];
      };
      deals: {
        Row: {
          archive_reason: string | null;
          archived_at: string | null;
          archived_by: string | null;
          assigned_to: string | null;
          client_id: string | null;
          close_outcome: string | null;
          closed_at: string | null;
          commission_rate: number | null;
          created_at: string;
          created_by: string | null;
          currency: string;
          deal_ref: string;
          expected_close: string | null;
          id: string;
          notes: string | null;
          opportunity_id: string | null;
          requirement_id: string | null;
          sector: string;
          stage: string;
          status: string;
          title: string;
          updated_at: string;
          value: number | null;
        };
        Insert: {
          archive_reason?: string | null;
          archived_at?: string | null;
          archived_by?: string | null;
          assigned_to?: string | null;
          client_id?: string | null;
          close_outcome?: string | null;
          closed_at?: string | null;
          commission_rate?: number | null;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          deal_ref?: string;
          expected_close?: string | null;
          id?: string;
          notes?: string | null;
          opportunity_id?: string | null;
          requirement_id?: string | null;
          sector: string;
          stage?: string;
          status?: string;
          title: string;
          updated_at?: string;
          value?: number | null;
        };
        Update: {
          archive_reason?: string | null;
          archived_at?: string | null;
          archived_by?: string | null;
          assigned_to?: string | null;
          client_id?: string | null;
          close_outcome?: string | null;
          closed_at?: string | null;
          commission_rate?: number | null;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          deal_ref?: string;
          expected_close?: string | null;
          id?: string;
          notes?: string | null;
          opportunity_id?: string | null;
          requirement_id?: string | null;
          sector?: string;
          stage?: string;
          status?: string;
          title?: string;
          updated_at?: string;
          value?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "deals_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "deals_opportunity_id_fkey";
            columns: ["opportunity_id"];
            isOneToOne: false;
            referencedRelation: "opportunities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "deals_requirement_id_fkey";
            columns: ["requirement_id"];
            isOneToOne: false;
            referencedRelation: "client_requirements";
            referencedColumns: ["id"];
          },
        ];
      };
      document_versions: {
        Row: {
          archive_reason: string | null;
          archived_at: string | null;
          archived_by: string | null;
          created_at: string;
          created_by: string | null;
          document_id: string;
          id: string;
          note: string | null;
          status: string;
          storage_path: string;
          updated_at: string;
          version: number;
        };
        Insert: {
          archive_reason?: string | null;
          archived_at?: string | null;
          archived_by?: string | null;
          created_at?: string;
          created_by?: string | null;
          document_id: string;
          id?: string;
          note?: string | null;
          status?: string;
          storage_path: string;
          updated_at?: string;
          version: number;
        };
        Update: {
          archive_reason?: string | null;
          archived_at?: string | null;
          archived_by?: string | null;
          created_at?: string;
          created_by?: string | null;
          document_id?: string;
          id?: string;
          note?: string | null;
          status?: string;
          storage_path?: string;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "document_versions_document_id_fkey";
            columns: ["document_id"];
            isOneToOne: false;
            referencedRelation: "documents";
            referencedColumns: ["id"];
          },
        ];
      };
      documents: {
        Row: {
          archive_reason: string | null;
          archived_at: string | null;
          archived_by: string | null;
          confidential: boolean;
          created_at: string;
          created_by: string | null;
          document_ref: string;
          document_type: string;
          id: string;
          mime_type: string | null;
          parent_id: string;
          parent_type: string;
          size_bytes: number | null;
          status: string;
          storage_path: string;
          title: string;
          updated_at: string;
          verification_status: string;
          version: number;
        };
        Insert: {
          archive_reason?: string | null;
          archived_at?: string | null;
          archived_by?: string | null;
          confidential?: boolean;
          created_at?: string;
          created_by?: string | null;
          document_ref?: string;
          document_type?: string;
          id?: string;
          mime_type?: string | null;
          parent_id: string;
          parent_type: string;
          size_bytes?: number | null;
          status?: string;
          storage_path: string;
          title: string;
          updated_at?: string;
          verification_status?: string;
          version?: number;
        };
        Update: {
          archive_reason?: string | null;
          archived_at?: string | null;
          archived_by?: string | null;
          confidential?: boolean;
          created_at?: string;
          created_by?: string | null;
          document_ref?: string;
          document_type?: string;
          id?: string;
          mime_type?: string | null;
          parent_id?: string;
          parent_type?: string;
          size_bytes?: number | null;
          status?: string;
          storage_path?: string;
          title?: string;
          updated_at?: string;
          verification_status?: string;
          version?: number;
        };
        Relationships: [];
      };
      form_submissions: {
        Row: {
          answers: Json;
          archive_reason: string | null;
          archived_at: string | null;
          archived_by: string | null;
          client_id: string | null;
          created_at: string;
          created_by: string | null;
          form_id: string;
          id: string;
          review_note: string | null;
          status: string;
          submitted_by_name: string | null;
          submitted_internally: boolean;
          updated_at: string;
        };
        Insert: {
          answers?: Json;
          archive_reason?: string | null;
          archived_at?: string | null;
          archived_by?: string | null;
          client_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          form_id: string;
          id?: string;
          review_note?: string | null;
          status?: string;
          submitted_by_name?: string | null;
          submitted_internally?: boolean;
          updated_at?: string;
        };
        Update: {
          answers?: Json;
          archive_reason?: string | null;
          archived_at?: string | null;
          archived_by?: string | null;
          client_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          form_id?: string;
          id?: string;
          review_note?: string | null;
          status?: string;
          submitted_by_name?: string | null;
          submitted_internally?: boolean;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "form_submissions_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "form_submissions_form_id_fkey";
            columns: ["form_id"];
            isOneToOne: false;
            referencedRelation: "forms";
            referencedColumns: ["id"];
          },
        ];
      };
      forms: {
        Row: {
          access_token: string;
          allow_multiple: boolean;
          archive_reason: string | null;
          archived_at: string | null;
          archived_by: string | null;
          client_id: string | null;
          created_at: string;
          created_by: string | null;
          expires_at: string | null;
          form_ref: string;
          id: string;
          opened_at: string | null;
          purpose: string | null;
          schema: Json;
          status: string;
          submitted_at: string | null;
          target: string;
          title: string;
          updated_at: string;
        };
        Insert: {
          access_token?: string;
          allow_multiple?: boolean;
          archive_reason?: string | null;
          archived_at?: string | null;
          archived_by?: string | null;
          client_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          expires_at?: string | null;
          form_ref?: string;
          id?: string;
          opened_at?: string | null;
          purpose?: string | null;
          schema?: Json;
          status?: string;
          submitted_at?: string | null;
          target?: string;
          title: string;
          updated_at?: string;
        };
        Update: {
          access_token?: string;
          allow_multiple?: boolean;
          archive_reason?: string | null;
          archived_at?: string | null;
          archived_by?: string | null;
          client_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          expires_at?: string | null;
          form_ref?: string;
          id?: string;
          opened_at?: string | null;
          purpose?: string | null;
          schema?: Json;
          status?: string;
          submitted_at?: string | null;
          target?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "forms_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
        ];
      };
      invoices: {
        Row: {
          amount: number;
          archive_reason: string | null;
          archived_at: string | null;
          archived_by: string | null;
          client_id: string | null;
          created_at: string;
          created_by: string | null;
          currency: string;
          deal_id: string | null;
          due_date: string | null;
          id: string;
          invoice_ref: string;
          narrative: string | null;
          status: string;
          updated_at: string;
        };
        Insert: {
          amount: number;
          archive_reason?: string | null;
          archived_at?: string | null;
          archived_by?: string | null;
          client_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          deal_id?: string | null;
          due_date?: string | null;
          id?: string;
          invoice_ref?: string;
          narrative?: string | null;
          status?: string;
          updated_at?: string;
        };
        Update: {
          amount?: number;
          archive_reason?: string | null;
          archived_at?: string | null;
          archived_by?: string | null;
          client_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          deal_id?: string | null;
          due_date?: string | null;
          id?: string;
          invoice_ref?: string;
          narrative?: string | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "invoices_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invoices_deal_id_fkey";
            columns: ["deal_id"];
            isOneToOne: false;
            referencedRelation: "deals";
            referencedColumns: ["id"];
          },
        ];
      };
      media: {
        Row: {
          archive_reason: string | null;
          archived_at: string | null;
          archived_by: string | null;
          caption: string | null;
          created_at: string;
          created_by: string | null;
          id: string;
          media_ref: string;
          media_type: string;
          mime_type: string | null;
          parent_id: string;
          parent_type: string;
          status: string;
          storage_path: string;
          updated_at: string;
        };
        Insert: {
          archive_reason?: string | null;
          archived_at?: string | null;
          archived_by?: string | null;
          caption?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          media_ref?: string;
          media_type?: string;
          mime_type?: string | null;
          parent_id: string;
          parent_type: string;
          status?: string;
          storage_path: string;
          updated_at?: string;
        };
        Update: {
          archive_reason?: string | null;
          archived_at?: string | null;
          archived_by?: string | null;
          caption?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          media_ref?: string;
          media_type?: string;
          mime_type?: string | null;
          parent_id?: string;
          parent_type?: string;
          status?: string;
          storage_path?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      negotiations: {
        Row: {
          archive_reason: string | null;
          archived_at: string | null;
          archived_by: string | null;
          created_at: string;
          created_by: string | null;
          deal_id: string;
          detail: string | null;
          entry_type: string;
          id: string;
          occurred_at: string;
          status: string;
          summary: string;
          updated_at: string;
        };
        Insert: {
          archive_reason?: string | null;
          archived_at?: string | null;
          archived_by?: string | null;
          created_at?: string;
          created_by?: string | null;
          deal_id: string;
          detail?: string | null;
          entry_type?: string;
          id?: string;
          occurred_at?: string;
          status?: string;
          summary: string;
          updated_at?: string;
        };
        Update: {
          archive_reason?: string | null;
          archived_at?: string | null;
          archived_by?: string | null;
          created_at?: string;
          created_by?: string | null;
          deal_id?: string;
          detail?: string | null;
          entry_type?: string;
          id?: string;
          occurred_at?: string;
          status?: string;
          summary?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "negotiations_deal_id_fkey";
            columns: ["deal_id"];
            isOneToOne: false;
            referencedRelation: "deals";
            referencedColumns: ["id"];
          },
        ];
      };
      notifications: {
        Row: {
          body: string | null;
          created_at: string;
          id: string;
          link: string | null;
          read_at: string | null;
          title: string;
          user_id: string;
        };
        Insert: {
          body?: string | null;
          created_at?: string;
          id?: string;
          link?: string | null;
          read_at?: string | null;
          title: string;
          user_id: string;
        };
        Update: {
          body?: string | null;
          created_at?: string;
          id?: string;
          link?: string | null;
          read_at?: string | null;
          title?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      objective_progress: {
        Row: {
          archive_reason: string | null;
          archived_at: string | null;
          archived_by: string | null;
          created_at: string;
          created_by: string | null;
          id: string;
          note: string;
          objective_id: string;
          progress: number;
          recorded_at: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          archive_reason?: string | null;
          archived_at?: string | null;
          archived_by?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          note: string;
          objective_id: string;
          progress?: number;
          recorded_at?: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          archive_reason?: string | null;
          archived_at?: string | null;
          archived_by?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          note?: string;
          objective_id?: string;
          progress?: number;
          recorded_at?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "objective_progress_objective_id_fkey";
            columns: ["objective_id"];
            isOneToOne: false;
            referencedRelation: "objectives";
            referencedColumns: ["id"];
          },
        ];
      };
      objectives: {
        Row: {
          archive_reason: string | null;
          archived_at: string | null;
          archived_by: string | null;
          budget: number | null;
          completed_at: string | null;
          created_at: string;
          created_by: string | null;
          currency: string;
          department: string | null;
          description: string | null;
          id: string;
          key_results: Json;
          notes: string | null;
          objective_ref: string;
          outcome: string | null;
          priority: string;
          progress: number;
          project_id: string | null;
          responsible_id: string | null;
          sector: string | null;
          start_date: string | null;
          status: string;
          target_date: string | null;
          title: string;
          updated_at: string;
        };
        Insert: {
          archive_reason?: string | null;
          archived_at?: string | null;
          archived_by?: string | null;
          budget?: number | null;
          completed_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          department?: string | null;
          description?: string | null;
          id?: string;
          key_results?: Json;
          notes?: string | null;
          objective_ref?: string;
          outcome?: string | null;
          priority?: string;
          progress?: number;
          project_id?: string | null;
          responsible_id?: string | null;
          sector?: string | null;
          start_date?: string | null;
          status?: string;
          target_date?: string | null;
          title: string;
          updated_at?: string;
        };
        Update: {
          archive_reason?: string | null;
          archived_at?: string | null;
          archived_by?: string | null;
          budget?: number | null;
          completed_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          department?: string | null;
          description?: string | null;
          id?: string;
          key_results?: Json;
          notes?: string | null;
          objective_ref?: string;
          outcome?: string | null;
          priority?: string;
          progress?: number;
          project_id?: string | null;
          responsible_id?: string | null;
          sector?: string | null;
          start_date?: string | null;
          status?: string;
          target_date?: string | null;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "objectives_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      offers: {
        Row: {
          amount: number;
          archive_reason: string | null;
          archived_at: string | null;
          archived_by: string | null;
          created_at: string;
          created_by: string | null;
          currency: string;
          deal_id: string;
          id: string;
          offered_at: string;
          offered_by: string;
          status: string;
          terms: string | null;
          updated_at: string;
        };
        Insert: {
          amount: number;
          archive_reason?: string | null;
          archived_at?: string | null;
          archived_by?: string | null;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          deal_id: string;
          id?: string;
          offered_at?: string;
          offered_by: string;
          status?: string;
          terms?: string | null;
          updated_at?: string;
        };
        Update: {
          amount?: number;
          archive_reason?: string | null;
          archived_at?: string | null;
          archived_by?: string | null;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          deal_id?: string;
          id?: string;
          offered_at?: string;
          offered_by?: string;
          status?: string;
          terms?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "offers_deal_id_fkey";
            columns: ["deal_id"];
            isOneToOne: false;
            referencedRelation: "deals";
            referencedColumns: ["id"];
          },
        ];
      };
      opportunities: {
        Row: {
          archive_reason: string | null;
          archived_at: string | null;
          archived_by: string | null;
          assigned_to: string | null;
          availability: string | null;
          created_at: string;
          created_by: string | null;
          currency: string;
          description: string | null;
          id: string;
          location: string | null;
          notes: string | null;
          opportunity_ref: string;
          opportunity_type: string;
          owner_contact: string | null;
          owner_name: string | null;
          price: number | null;
          quantity: string | null;
          requirements: string | null;
          sector: string;
          sector_details: Json;
          source: string | null;
          status: string;
          title: string;
          updated_at: string;
          verification_status: string;
        };
        Insert: {
          archive_reason?: string | null;
          archived_at?: string | null;
          archived_by?: string | null;
          assigned_to?: string | null;
          availability?: string | null;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          description?: string | null;
          id?: string;
          location?: string | null;
          notes?: string | null;
          opportunity_ref?: string;
          opportunity_type: string;
          owner_contact?: string | null;
          owner_name?: string | null;
          price?: number | null;
          quantity?: string | null;
          requirements?: string | null;
          sector: string;
          sector_details?: Json;
          source?: string | null;
          status?: string;
          title: string;
          updated_at?: string;
          verification_status?: string;
        };
        Update: {
          archive_reason?: string | null;
          archived_at?: string | null;
          archived_by?: string | null;
          assigned_to?: string | null;
          availability?: string | null;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          description?: string | null;
          id?: string;
          location?: string | null;
          notes?: string | null;
          opportunity_ref?: string;
          opportunity_type?: string;
          owner_contact?: string | null;
          owner_name?: string | null;
          price?: number | null;
          quantity?: string | null;
          requirements?: string | null;
          sector?: string;
          sector_details?: Json;
          source?: string | null;
          status?: string;
          title?: string;
          updated_at?: string;
          verification_status?: string;
        };
        Relationships: [];
      };
      opportunity_matches: {
        Row: {
          archive_reason: string | null;
          archived_at: string | null;
          archived_by: string | null;
          created_at: string;
          created_by: string | null;
          id: string;
          opportunity_id: string;
          reasons: Json;
          requirement_id: string;
          reviewed_at: string | null;
          reviewed_by: string | null;
          score: number;
          status: string;
          updated_at: string;
        };
        Insert: {
          archive_reason?: string | null;
          archived_at?: string | null;
          archived_by?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          opportunity_id: string;
          reasons?: Json;
          requirement_id: string;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          score?: number;
          status?: string;
          updated_at?: string;
        };
        Update: {
          archive_reason?: string | null;
          archived_at?: string | null;
          archived_by?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          opportunity_id?: string;
          reasons?: Json;
          requirement_id?: string;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          score?: number;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "opportunity_matches_opportunity_id_fkey";
            columns: ["opportunity_id"];
            isOneToOne: false;
            referencedRelation: "opportunities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "opportunity_matches_requirement_id_fkey";
            columns: ["requirement_id"];
            isOneToOne: false;
            referencedRelation: "client_requirements";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          created_at: string;
          department: string | null;
          email: string;
          full_name: string;
          id: string;
          job_title: string | null;
          last_login_at: string | null;
          must_change_password: boolean;
          phone: string | null;
          photo_url: string | null;
          status: Database["public"]["Enums"]["account_status"];
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          department?: string | null;
          email: string;
          full_name?: string;
          id: string;
          job_title?: string | null;
          last_login_at?: string | null;
          must_change_password?: boolean;
          phone?: string | null;
          photo_url?: string | null;
          status?: Database["public"]["Enums"]["account_status"];
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          department?: string | null;
          email?: string;
          full_name?: string;
          id?: string;
          job_title?: string | null;
          last_login_at?: string | null;
          must_change_password?: boolean;
          phone?: string | null;
          photo_url?: string | null;
          status?: Database["public"]["Enums"]["account_status"];
          updated_at?: string;
        };
        Relationships: [];
      };
      projects: {
        Row: {
          archive_reason: string | null;
          archived_at: string | null;
          archived_by: string | null;
          created_at: string;
          created_by: string | null;
          department: string | null;
          description: string | null;
          id: string;
          lead_id: string | null;
          project_ref: string;
          start_date: string | null;
          status: string;
          target_date: string | null;
          title: string;
          updated_at: string;
        };
        Insert: {
          archive_reason?: string | null;
          archived_at?: string | null;
          archived_by?: string | null;
          created_at?: string;
          created_by?: string | null;
          department?: string | null;
          description?: string | null;
          id?: string;
          lead_id?: string | null;
          project_ref?: string;
          start_date?: string | null;
          status?: string;
          target_date?: string | null;
          title: string;
          updated_at?: string;
        };
        Update: {
          archive_reason?: string | null;
          archived_at?: string | null;
          archived_by?: string | null;
          created_at?: string;
          created_by?: string | null;
          department?: string | null;
          description?: string | null;
          id?: string;
          lead_id?: string | null;
          project_ref?: string;
          start_date?: string | null;
          status?: string;
          target_date?: string | null;
          title?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      receipts: {
        Row: {
          amount: number;
          archive_reason: string | null;
          archived_at: string | null;
          archived_by: string | null;
          created_at: string;
          created_by: string | null;
          currency: string;
          id: string;
          issued_to: string;
          narrative: string | null;
          receipt_ref: string;
          status: string;
          transaction_id: string;
          updated_at: string;
          verification_ref: string;
        };
        Insert: {
          amount: number;
          archive_reason?: string | null;
          archived_at?: string | null;
          archived_by?: string | null;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          id?: string;
          issued_to: string;
          narrative?: string | null;
          receipt_ref?: string;
          status?: string;
          transaction_id: string;
          updated_at?: string;
          verification_ref?: string;
        };
        Update: {
          amount?: number;
          archive_reason?: string | null;
          archived_at?: string | null;
          archived_by?: string | null;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          id?: string;
          issued_to?: string;
          narrative?: string | null;
          receipt_ref?: string;
          status?: string;
          transaction_id?: string;
          updated_at?: string;
          verification_ref?: string;
        };
        Relationships: [
          {
            foreignKeyName: "receipts_transaction_id_fkey";
            columns: ["transaction_id"];
            isOneToOne: false;
            referencedRelation: "transactions";
            referencedColumns: ["id"];
          },
        ];
      };
      research_cases: {
        Row: {
          archive_reason: string | null;
          archived_at: string | null;
          archived_by: string | null;
          case_ref: string;
          client_id: string | null;
          created_at: string;
          created_by: string | null;
          deal_id: string | null;
          findings: string | null;
          id: string;
          keywords: string[];
          notes: string | null;
          related_party: string | null;
          research_question: string | null;
          researcher_id: string | null;
          sources: Json;
          status: string;
          subject: string;
          updated_at: string;
        };
        Insert: {
          archive_reason?: string | null;
          archived_at?: string | null;
          archived_by?: string | null;
          case_ref?: string;
          client_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          deal_id?: string | null;
          findings?: string | null;
          id?: string;
          keywords?: string[];
          notes?: string | null;
          related_party?: string | null;
          research_question?: string | null;
          researcher_id?: string | null;
          sources?: Json;
          status?: string;
          subject: string;
          updated_at?: string;
        };
        Update: {
          archive_reason?: string | null;
          archived_at?: string | null;
          archived_by?: string | null;
          case_ref?: string;
          client_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          deal_id?: string | null;
          findings?: string | null;
          id?: string;
          keywords?: string[];
          notes?: string | null;
          related_party?: string | null;
          research_question?: string | null;
          researcher_id?: string | null;
          sources?: Json;
          status?: string;
          subject?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "research_cases_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "research_cases_deal_id_fkey";
            columns: ["deal_id"];
            isOneToOne: false;
            referencedRelation: "deals";
            referencedColumns: ["id"];
          },
        ];
      };
      risk_cases: {
        Row: {
          allegation: string | null;
          archive_reason: string | null;
          archived_at: string | null;
          archived_by: string | null;
          case_kind: string;
          case_ref: string | null;
          client_id: string | null;
          closed_at: string | null;
          created_at: string;
          created_by: string | null;
          deal_id: string | null;
          description: string;
          id: string;
          investigator_id: string | null;
          resolution: string | null;
          severity: string;
          source: string | null;
          status: string;
          subject_company: string | null;
          subject_email: string | null;
          subject_identifier: string | null;
          subject_name: string;
          subject_phone: string | null;
          updated_at: string;
          verified_finding: string | null;
        };
        Insert: {
          allegation?: string | null;
          archive_reason?: string | null;
          archived_at?: string | null;
          archived_by?: string | null;
          case_kind?: string;
          case_ref?: string | null;
          client_id?: string | null;
          closed_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          deal_id?: string | null;
          description: string;
          id?: string;
          investigator_id?: string | null;
          resolution?: string | null;
          severity?: string;
          source?: string | null;
          status?: string;
          subject_company?: string | null;
          subject_email?: string | null;
          subject_identifier?: string | null;
          subject_name: string;
          subject_phone?: string | null;
          updated_at?: string;
          verified_finding?: string | null;
        };
        Update: {
          allegation?: string | null;
          archive_reason?: string | null;
          archived_at?: string | null;
          archived_by?: string | null;
          case_kind?: string;
          case_ref?: string | null;
          client_id?: string | null;
          closed_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          deal_id?: string | null;
          description?: string;
          id?: string;
          investigator_id?: string | null;
          resolution?: string | null;
          severity?: string;
          source?: string | null;
          status?: string;
          subject_company?: string | null;
          subject_email?: string | null;
          subject_identifier?: string | null;
          subject_name?: string;
          subject_phone?: string | null;
          updated_at?: string;
          verified_finding?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "risk_cases_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "risk_cases_deal_id_fkey";
            columns: ["deal_id"];
            isOneToOne: false;
            referencedRelation: "deals";
            referencedColumns: ["id"];
          },
        ];
      };
      role_permissions: {
        Row: {
          created_at: string;
          permission: string;
          role_key: string;
        };
        Insert: {
          created_at?: string;
          permission: string;
          role_key: string;
        };
        Update: {
          created_at?: string;
          permission?: string;
          role_key?: string;
        };
        Relationships: [
          {
            foreignKeyName: "role_permissions_role_key_fkey";
            columns: ["role_key"];
            isOneToOne: false;
            referencedRelation: "roles";
            referencedColumns: ["key"];
          },
        ];
      };
      roles: {
        Row: {
          created_at: string;
          description: string | null;
          is_system: boolean;
          key: string;
          label: string;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          is_system?: boolean;
          key: string;
          label: string;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          is_system?: boolean;
          key?: string;
          label?: string;
        };
        Relationships: [];
      };
      tasks: {
        Row: {
          archive_reason: string | null;
          archived_at: string | null;
          archived_by: string | null;
          assigned_to: string | null;
          client_id: string | null;
          created_at: string;
          created_by: string | null;
          deal_id: string | null;
          detail: string | null;
          due_date: string | null;
          id: string;
          status: string;
          title: string;
          updated_at: string;
        };
        Insert: {
          archive_reason?: string | null;
          archived_at?: string | null;
          archived_by?: string | null;
          assigned_to?: string | null;
          client_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          deal_id?: string | null;
          detail?: string | null;
          due_date?: string | null;
          id?: string;
          status?: string;
          title: string;
          updated_at?: string;
        };
        Update: {
          archive_reason?: string | null;
          archived_at?: string | null;
          archived_by?: string | null;
          assigned_to?: string | null;
          client_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          deal_id?: string | null;
          detail?: string | null;
          due_date?: string | null;
          id?: string;
          status?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tasks_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tasks_deal_id_fkey";
            columns: ["deal_id"];
            isOneToOne: false;
            referencedRelation: "deals";
            referencedColumns: ["id"];
          },
        ];
      };
      transactions: {
        Row: {
          amount: number;
          archive_reason: string | null;
          archived_at: string | null;
          archived_by: string | null;
          client_id: string | null;
          commission_amount: number | null;
          created_at: string;
          created_by: string | null;
          currency: string;
          deal_id: string | null;
          id: string;
          occurred_on: string;
          payment_method: string | null;
          payment_reference: string | null;
          purpose: string;
          status: string;
          transaction_ref: string;
          updated_at: string;
        };
        Insert: {
          amount: number;
          archive_reason?: string | null;
          archived_at?: string | null;
          archived_by?: string | null;
          client_id?: string | null;
          commission_amount?: number | null;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          deal_id?: string | null;
          id?: string;
          occurred_on?: string;
          payment_method?: string | null;
          payment_reference?: string | null;
          purpose: string;
          status?: string;
          transaction_ref?: string;
          updated_at?: string;
        };
        Update: {
          amount?: number;
          archive_reason?: string | null;
          archived_at?: string | null;
          archived_by?: string | null;
          client_id?: string | null;
          commission_amount?: number | null;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          deal_id?: string | null;
          id?: string;
          occurred_on?: string;
          payment_method?: string | null;
          payment_reference?: string | null;
          purpose?: string;
          status?: string;
          transaction_ref?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "transactions_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transactions_deal_id_fkey";
            columns: ["deal_id"];
            isOneToOne: false;
            referencedRelation: "deals";
            referencedColumns: ["id"];
          },
        ];
      };
      user_role_assignments: {
        Row: {
          created_at: string;
          id: string;
          role_key: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          role_key: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role_key?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_role_assignments_role_key_fkey";
            columns: ["role_key"];
            isOneToOne: false;
            referencedRelation: "roles";
            referencedColumns: ["key"];
          },
        ];
      };
      user_roles: {
        Row: {
          created_at: string;
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
      verification_items: {
        Row: {
          archive_reason: string | null;
          archived_at: string | null;
          archived_by: string | null;
          comment: string | null;
          created_at: string;
          created_by: string | null;
          id: string;
          label: string;
          requirement_note: string | null;
          state: string;
          status: string;
          updated_at: string;
          verification_id: string;
        };
        Insert: {
          archive_reason?: string | null;
          archived_at?: string | null;
          archived_by?: string | null;
          comment?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          label: string;
          requirement_note?: string | null;
          state?: string;
          status?: string;
          updated_at?: string;
          verification_id: string;
        };
        Update: {
          archive_reason?: string | null;
          archived_at?: string | null;
          archived_by?: string | null;
          comment?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          label?: string;
          requirement_note?: string | null;
          state?: string;
          status?: string;
          updated_at?: string;
          verification_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "verification_items_verification_id_fkey";
            columns: ["verification_id"];
            isOneToOne: false;
            referencedRelation: "verifications";
            referencedColumns: ["id"];
          },
        ];
      };
      verifications: {
        Row: {
          archive_reason: string | null;
          archived_at: string | null;
          archived_by: string | null;
          case_kind: string;
          case_ref: string;
          client_id: string | null;
          created_at: string;
          created_by: string | null;
          deal_id: string | null;
          decided_at: string | null;
          findings: string | null;
          id: string;
          officer_id: string | null;
          opportunity_id: string | null;
          sector: string | null;
          status: string;
          subject: string;
          summary: string | null;
          updated_at: string;
        };
        Insert: {
          archive_reason?: string | null;
          archived_at?: string | null;
          archived_by?: string | null;
          case_kind?: string;
          case_ref?: string;
          client_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          deal_id?: string | null;
          decided_at?: string | null;
          findings?: string | null;
          id?: string;
          officer_id?: string | null;
          opportunity_id?: string | null;
          sector?: string | null;
          status?: string;
          subject: string;
          summary?: string | null;
          updated_at?: string;
        };
        Update: {
          archive_reason?: string | null;
          archived_at?: string | null;
          archived_by?: string | null;
          case_kind?: string;
          case_ref?: string;
          client_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          deal_id?: string | null;
          decided_at?: string | null;
          findings?: string | null;
          id?: string;
          officer_id?: string | null;
          opportunity_id?: string | null;
          sector?: string | null;
          status?: string;
          subject?: string;
          summary?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "verifications_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "verifications_deal_id_fkey";
            columns: ["deal_id"];
            isOneToOne: false;
            referencedRelation: "deals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "verifications_opportunity_id_fkey";
            columns: ["opportunity_id"];
            isOneToOne: false;
            referencedRelation: "opportunities";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      has_permission: {
        Args: { _perm: string; _user_id: string };
        Returns: boolean;
      };
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
      is_active_staff: { Args: { _user_id: string }; Returns: boolean };
      login_identity: {
        Args: { _email: string };
        Returns: {
          department: string;
          full_name: string;
          job_title: string;
          photo_url: string;
        }[];
      };
      login_email_by_phone: {
        Args: { _phone: string };
        Returns: { email: string }[];
      };
      maintenance_access_allowed: {
        Args: never;
        Returns: boolean;
      };
      my_permissions: {
        Args: never;
        Returns: {
          permission: string;
        }[];
      };
    };
    Enums: {
      account_status: "active" | "disabled" | "pending";
      app_role:
        | "super_admin"
        | "receptionist"
        | "onboarding_officer"
        | "deals_manager"
        | "verification_officer"
        | "risk_officer"
        | "finance_officer"
        | "management"
        | "auditor";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      account_status: ["active", "disabled", "pending"],
      app_role: [
        "super_admin",
        "receptionist",
        "onboarding_officer",
        "deals_manager",
        "verification_officer",
        "risk_officer",
        "finance_officer",
        "management",
        "auditor",
      ],
    },
  },
} as const;
