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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      branches: {
        Row: {
          address: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          organization_id: string
          phone: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          organization_id: string
          phone?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string
          phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "branches_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string
          id: string
          name: string
          organization_id: string
          parent_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          organization_id: string
          parent_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          organization_id?: string
          parent_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "categories_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      controlled_substance_log: {
        Row: {
          balance_after: number
          batch_id: string
          branch_id: string
          created_at: string
          id: string
          patient_name: string | null
          prescriber_name: string | null
          prescription_number: string | null
          product_id: string
          quantity: number
          recorded_by: string
          sale_id: string | null
          transaction_type: string
        }
        Insert: {
          balance_after: number
          batch_id: string
          branch_id: string
          created_at?: string
          id?: string
          patient_name?: string | null
          prescriber_name?: string | null
          prescription_number?: string | null
          product_id: string
          quantity: number
          recorded_by: string
          sale_id?: string | null
          transaction_type: string
        }
        Update: {
          balance_after?: number
          batch_id?: string
          branch_id?: string
          created_at?: string
          id?: string
          patient_name?: string | null
          prescriber_name?: string | null
          prescription_number?: string | null
          product_id?: string
          quantity?: number
          recorded_by?: string
          sale_id?: string | null
          transaction_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "controlled_substance_log_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "product_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "controlled_substance_log_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "controlled_substance_log_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_stock"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "controlled_substance_log_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "controlled_substance_log_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "controlled_substance_log_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          address: string | null
          created_at: string
          email: string | null
          id: string
          logo_url: string | null
          name: string
          phone: string | null
          registration_number: string | null
          settings: Json
        }
        Insert: {
          address?: string | null
          created_at?: string
          email?: string | null
          id?: string
          logo_url?: string | null
          name: string
          phone?: string | null
          registration_number?: string | null
          settings?: Json
        }
        Update: {
          address?: string | null
          created_at?: string
          email?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          phone?: string | null
          registration_number?: string | null
          settings?: Json
        }
        Relationships: []
      }
      product_batches: {
        Row: {
          batch_number: string
          branch_id: string
          cost_price: number | null
          created_at: string
          expiry_date: string
          id: string
          manufactured_date: string | null
          notes: string | null
          product_id: string
          purchase_order_id: string | null
          quantity_received: number
          quantity_remaining: number
          received_at: string
          received_by: string | null
          supplier_id: string | null
        }
        Insert: {
          batch_number: string
          branch_id: string
          cost_price?: number | null
          created_at?: string
          expiry_date: string
          id?: string
          manufactured_date?: string | null
          notes?: string | null
          product_id: string
          purchase_order_id?: string | null
          quantity_received: number
          quantity_remaining: number
          received_at?: string
          received_by?: string | null
          supplier_id?: string | null
        }
        Update: {
          batch_number?: string
          branch_id?: string
          cost_price?: number | null
          created_at?: string
          expiry_date?: string
          id?: string
          manufactured_date?: string | null
          notes?: string | null
          product_id?: string
          purchase_order_id?: string | null
          quantity_received?: number
          quantity_remaining?: number
          received_at?: string
          received_by?: string | null
          supplier_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_batches_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_stock"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_batches_received_by_fkey"
            columns: ["received_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_batches_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      product_pack_sizes: {
        Row: {
          barcode: string | null
          created_at: string
          id: string
          is_active: boolean
          pack_label: string
          product_id: string
          selling_price: number
          units_per_pack: number
        }
        Insert: {
          barcode?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          pack_label: string
          product_id: string
          selling_price: number
          units_per_pack: number
        }
        Update: {
          barcode?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          pack_label?: string
          product_id?: string
          selling_price?: number
          units_per_pack?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_pack_sizes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          barcode_raw: string | null
          base_unit: string
          brand_name: string | null
          category_id: string | null
          cost_price: number | null
          created_at: string
          created_by: string | null
          dosage_form: string | null
          gtin: string | null
          id: string
          image_url: string | null
          is_active: boolean
          is_controlled: boolean
          manufacturer: string | null
          max_discount_percent: number | null
          name: string
          organization_id: string
          pack_label: string | null
          reorder_level: number
          reorder_quantity: number
          requires_prescription: boolean
          selling_price: number
          strength: string | null
          units_per_pack: number
          updated_at: string
        }
        Insert: {
          barcode_raw?: string | null
          base_unit: string
          brand_name?: string | null
          category_id?: string | null
          cost_price?: number | null
          created_at?: string
          created_by?: string | null
          dosage_form?: string | null
          gtin?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_controlled?: boolean
          manufacturer?: string | null
          max_discount_percent?: number | null
          name: string
          organization_id: string
          pack_label?: string | null
          reorder_level?: number
          reorder_quantity?: number
          requires_prescription?: boolean
          selling_price: number
          strength?: string | null
          units_per_pack?: number
          updated_at?: string
        }
        Update: {
          barcode_raw?: string | null
          base_unit?: string
          brand_name?: string | null
          category_id?: string | null
          cost_price?: number | null
          created_at?: string
          created_by?: string | null
          dosage_form?: string | null
          gtin?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_controlled?: boolean
          manufacturer?: string | null
          max_discount_percent?: number | null
          name?: string
          organization_id?: string
          pack_label?: string | null
          reorder_level?: number
          reorder_quantity?: number
          requires_prescription?: boolean
          selling_price?: number
          strength?: string | null
          units_per_pack?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          branch_id: string | null
          created_at: string
          full_name: string
          id: string
          is_active: boolean
          organization_id: string
          phone: string | null
          pin_hash: string | null
          role: string
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          full_name: string
          id: string
          is_active?: boolean
          organization_id: string
          phone?: string | null
          pin_hash?: string | null
          role: string
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          full_name?: string
          id?: string
          is_active?: boolean
          organization_id?: string
          phone?: string | null
          pin_hash?: string | null
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_items: {
        Row: {
          base_unit: string
          batch_id: string | null
          created_at: string
          discount_percent: number
          id: string
          line_total: number
          product_id: string
          product_name: string
          product_strength: string | null
          quantity: number
          sale_id: string
          unit_price: number
        }
        Insert: {
          base_unit: string
          batch_id?: string | null
          created_at?: string
          discount_percent?: number
          id?: string
          line_total: number
          product_id: string
          product_name: string
          product_strength?: string | null
          quantity: number
          sale_id: string
          unit_price: number
        }
        Update: {
          base_unit?: string
          batch_id?: string | null
          created_at?: string
          discount_percent?: number
          id?: string
          line_total?: number
          product_id?: string
          product_name?: string
          product_strength?: string | null
          quantity?: number
          sale_id?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "sale_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "product_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_stock"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "sale_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          amount_tendered: number | null
          branch_id: string
          cashier_id: string
          change_given: number | null
          created_at: string
          customer_name: string | null
          customer_phone: string | null
          discount_amount: number
          id: string
          mpesa_reference: string | null
          notes: string | null
          payment_method: string
          receipt_number: string
          shift_id: string | null
          status: string
          subtotal: number
          tax_amount: number
          total_amount: number
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          amount_tendered?: number | null
          branch_id: string
          cashier_id: string
          change_given?: number | null
          created_at?: string
          customer_name?: string | null
          customer_phone?: string | null
          discount_amount?: number
          id?: string
          mpesa_reference?: string | null
          notes?: string | null
          payment_method: string
          receipt_number: string
          shift_id?: string | null
          status?: string
          subtotal: number
          tax_amount?: number
          total_amount: number
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          amount_tendered?: number | null
          branch_id?: string
          cashier_id?: string
          change_given?: number | null
          created_at?: string
          customer_name?: string | null
          customer_phone?: string | null
          discount_amount?: number
          id?: string
          mpesa_reference?: string | null
          notes?: string | null
          payment_method?: string
          receipt_number?: string
          shift_id?: string | null
          status?: string
          subtotal?: number
          tax_amount?: number
          total_amount?: number
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_cashier_id_fkey"
            columns: ["cashier_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_voided_by_fkey"
            columns: ["voided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      shifts: {
        Row: {
          branch_id: string
          clocked_in_at: string
          clocked_out_at: string | null
          closing_cash: number | null
          created_at: string
          id: string
          notes: string | null
          opening_float: number
          staff_id: string
        }
        Insert: {
          branch_id: string
          clocked_in_at: string
          clocked_out_at?: string | null
          closing_cash?: number | null
          created_at?: string
          id?: string
          notes?: string | null
          opening_float?: number
          staff_id: string
        }
        Update: {
          branch_id?: string
          clocked_in_at?: string
          clocked_out_at?: string | null
          closing_cash?: number | null
          created_at?: string
          id?: string
          notes?: string | null
          opening_float?: number
          staff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shifts_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shifts_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          address: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          organization_id: string
          phone: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          organization_id: string
          phone?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          organization_id?: string
          phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      product_stock: {
        Row: {
          barcode_raw: string | null
          base_unit: string | null
          batch_count: number | null
          branch_id: string | null
          brand_name: string | null
          category_id: string | null
          cost_price: number | null
          dosage_form: string | null
          earliest_expiry: string | null
          gtin: string | null
          image_url: string | null
          is_active: boolean | null
          is_controlled: boolean | null
          max_discount_percent: number | null
          name: string | null
          organization_id: string | null
          pack_label: string | null
          product_id: string | null
          reorder_level: number | null
          requires_prescription: boolean | null
          selling_price: number | null
          stock_on_hand: number | null
          strength: string | null
          units_per_pack: number | null
        }
        Relationships: [
          {
            foreignKeyName: "product_batches_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      generate_receipt_number: {
        Args: { p_branch_id: string }
        Returns: string
      }
      user_branch_id: { Args: never; Returns: string }
      user_organization_id: { Args: never; Returns: string }
      user_role: { Args: never; Returns: string }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
