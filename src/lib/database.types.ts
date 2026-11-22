export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: { extensions?: Json; operationName?: string; query?: string; variables?: Json };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      daily_logs: {
        Row: {
          acknowledged_at: string | null;
          closed_at: string;
          core_done: number;
          core_total: number;
          log_date: string;
          status: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          acknowledged_at?: string | null;
          closed_at?: string;
          core_done?: number;
          core_total?: number;
          log_date: string;
          status: string;
          user_id: string;
        };
        Update: {
          acknowledged_at?: string | null;
          closed_at?: string;
          core_done?: number;
          core_total?: number;
          log_date?: string;
          status?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      food_entries: {
        Row: {
          created_at: string;
          id: string;
          kcal: number;
          name: string;
          occurred_on: string;
          protein_g: number;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          kcal: number;
          name: string;
          occurred_on: string;
          protein_g: number;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          kcal?: number;
          name?: string;
          occurred_on?: string;
          protein_g?: number;
          user_id?: string;
        };
        Relationships: [];
      };
      game_config: {
        Row: {
          key: string;
          updated_at: string;
          value: NonNullable<Json>;
        };
        ComputedFields: never;
        Insert: {
          key: string;
          updated_at?: string;
          value: NonNullable<Json>;
        };
        Update: {
          key?: string;
          updated_at?: string;
          value?: NonNullable<Json>;
        };
        Relationships: [];
      };
      hunter_target_history: {
        Row: {
          created_at: string;
          effective_on: string;
          kcal_max: number;
          kcal_min: number;
          protein_target_g: number;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          effective_on: string;
          kcal_max: number;
          kcal_min: number;
          protein_target_g: number;
          user_id: string;
        };
        Update: {
          created_at?: string;
          effective_on?: string;
          kcal_max?: number;
          kcal_min?: number;
          protein_target_g?: number;
          user_id?: string;
        };
        Relationships: [];
      };
      hunters: {
        Row: {
          created_at: string;
          created_on: string;
          hunter_name: string;
          kcal_max: number;
          kcal_min: number;
          last_closed_on: string | null;
          protein_target_g: number;
          timezone: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          created_on: string;
          hunter_name: string;
          kcal_max: number;
          kcal_min: number;
          last_closed_on?: string | null;
          protein_target_g: number;
          timezone?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          created_on?: string;
          hunter_name?: string;
          kcal_max?: number;
          kcal_min?: number;
          last_closed_on?: string | null;
          protein_target_g?: number;
          timezone?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      quest_completions: {
        Row: {
          completed_at: string;
          id: string;
          occurred_on: string;
          quest_id: string;
          reversed_at: string | null;
          user_id: string;
          value: number | null;
        };
        ComputedFields: never;
        Insert: {
          completed_at?: string;
          id?: string;
          occurred_on: string;
          quest_id: string;
          reversed_at?: string | null;
          user_id: string;
          value?: number | null;
        };
        Update: {
          completed_at?: string;
          id?: string;
          occurred_on?: string;
          quest_id?: string;
          reversed_at?: string | null;
          user_id?: string;
          value?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'quest_completions_quest_id_fkey';
            columns: ['quest_id'];
            isOneToOne: false;
            referencedRelation: 'quests';
            referencedColumns: ['id'];
          },
        ];
      };
      quests: {
        Row: {
          archived_at: string | null;
          category: string;
          created_at: string;
          difficulty: string;
          due_on: string | null;
          goal_type: string;
          id: string;
          is_core: boolean;
          schedule_days: number[] | null;
          sort_order: number;
          stat_tags: string[];
          target_value: number | null;
          title: string;
          tracking: string;
          type: string;
          unit: string | null;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          archived_at?: string | null;
          category: string;
          created_at?: string;
          difficulty: string;
          due_on?: string | null;
          goal_type: string;
          id?: string;
          is_core?: boolean;
          schedule_days?: number[] | null;
          sort_order?: number;
          stat_tags: string[];
          target_value?: number | null;
          title: string;
          tracking?: string;
          type: string;
          unit?: string | null;
          user_id: string;
        };
        Update: {
          archived_at?: string | null;
          category?: string;
          created_at?: string;
          difficulty?: string;
          due_on?: string | null;
          goal_type?: string;
          id?: string;
          is_core?: boolean;
          schedule_days?: number[] | null;
          sort_order?: number;
          stat_tags?: string[];
          target_value?: number | null;
          title?: string;
          tracking?: string;
          type?: string;
          unit?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
      stat_allocations: {
        Row: {
          created_at: string;
          id: string;
          points: number;
          stat: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          points: number;
          stat: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          points?: number;
          stat?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      workout_sets: {
        Row: {
          exercise_name: string;
          id: string;
          reps: number;
          set_index: number;
          user_id: string;
          weight_kg: number | null;
          workout_id: string;
        };
        ComputedFields: never;
        Insert: {
          exercise_name: string;
          id?: string;
          reps: number;
          set_index: number;
          user_id: string;
          weight_kg?: number | null;
          workout_id: string;
        };
        Update: {
          exercise_name?: string;
          id?: string;
          reps?: number;
          set_index?: number;
          user_id?: string;
          weight_kg?: number | null;
          workout_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'workout_sets_workout_id_fkey';
            columns: ['workout_id'];
            isOneToOne: false;
            referencedRelation: 'workouts';
            referencedColumns: ['id'];
          },
        ];
      };
      workouts: {
        Row: {
          created_at: string;
          id: string;
          notes: string | null;
          occurred_on: string;
          title: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          notes?: string | null;
          occurred_on: string;
          title: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          notes?: string | null;
          occurred_on?: string;
          title?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      xp_events: {
        Row: {
          agi_xp: number;
          capped: boolean;
          category: string | null;
          created_at: string;
          free_points: number;
          id: string;
          int_xp: number;
          occurred_on: string;
          reverses_event_id: string | null;
          sense_xp: number;
          source_id: string | null;
          source_type: string;
          str_xp: number;
          user_id: string;
          vit_xp: number;
          xp: number;
        };
        ComputedFields: never;
        Insert: {
          agi_xp?: number;
          capped?: boolean;
          category?: string | null;
          created_at?: string;
          free_points?: number;
          id?: string;
          int_xp?: number;
          occurred_on: string;
          reverses_event_id?: string | null;
          sense_xp?: number;
          source_id?: string | null;
          source_type: string;
          str_xp?: number;
          user_id: string;
          vit_xp?: number;
          xp?: number;
        };
        Update: {
          agi_xp?: number;
          capped?: boolean;
          category?: string | null;
          created_at?: string;
          free_points?: number;
          id?: string;
          int_xp?: number;
          occurred_on?: string;
          reverses_event_id?: string | null;
          sense_xp?: number;
          source_id?: string | null;
          source_type?: string;
          str_xp?: number;
          user_id?: string;
          vit_xp?: number;
          xp?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'xp_events_reverses_event_id_fkey';
            columns: ['reverses_event_id'];
            isOneToOne: false;
            referencedRelation: 'xp_events';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      acknowledge_report: { Args: Record<PropertyKey, never>; Returns: Json };
      active_completion_id: { Args: { p_day: string; p_quest_id: string }; Returns: string };
      allocate_points: { Args: { p_points: number; p_stat: string }; Returns: Json };
      assert_authenticated: { Args: Record<PropertyKey, never>; Returns: string };
      auto_quest_for: {
        Args: { p_day: string; p_tracking: string; p_user: string };
        Returns: {
          archived_at: string | null;
          category: string;
          created_at: string;
          difficulty: string;
          due_on: string | null;
          goal_type: string;
          id: string;
          is_core: boolean;
          schedule_days: number[] | null;
          sort_order: number;
          stat_tags: string[];
          target_value: number | null;
          title: string;
          tracking: string;
          type: string;
          unit: string | null;
          user_id: string;
        };
        SetofOptions: {
          from: '*';
          to: 'quests';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      award_quest_completion: {
        Args: {
          p_day: string;
          p_quest: Omit<
            Database['public']['Tables']['quests']['Row'],
            Database['public']['Tables']['quests']['ComputedFields']
          >;
          p_user: string;
          p_value?: number;
        };
        Returns: Json;
      };
      close_days: { Args: Record<PropertyKey, never>; Returns: Json };
      complete_quest: { Args: { p_quest_id: string; p_value?: number }; Returns: Json };
      compute_quest_award: {
        Args: {
          p_category: string;
          p_category_xp_today: number;
          p_difficulty: string;
          p_stat_tags: string[];
        };
        Returns: Record<string, unknown>;
      };
      daily_cap_for: { Args: { p_category: string }; Returns: number };
      delete_food: { Args: { p_id: string }; Returns: Json };
      delete_workout: { Args: { p_id: string }; Returns: Json };
      effective_targets: {
        Args: { p_day: string; p_user: string };
        Returns: Record<string, unknown>;
      };
      evaluate_auto_kcal_range: { Args: { p_day: string; p_user: string }; Returns: Json };
      evaluate_auto_protein: { Args: { p_day: string; p_user: string }; Returns: Json };
      evaluate_auto_workout: { Args: { p_day: string; p_user: string }; Returns: Json };
      game_config_int: { Args: { p_key: string }; Returns: number };
      game_config_value: { Args: { p_key: string }; Returns: Json };
      game_date_at: {
        Args: { p_instant: string; p_start_hour?: number; p_timezone: string };
        Returns: string;
      };
      game_today: { Args: Record<PropertyKey, never>; Returns: string };
      game_today_for: { Args: { p_user: string }; Returns: string };
      hunter_snapshot: { Args: Record<PropertyKey, never>; Returns: Json };
      is_valid_timezone: { Args: { p_timezone: string }; Returns: boolean };
      log_food: { Args: { p_kcal: number; p_name: string; p_protein_g: number }; Returns: Json };
      log_workout: { Args: { p_notes: string; p_sets?: Json; p_title: string }; Returns: Json };
      onboard_hunter: {
        Args: {
          p_hunter_name: string;
          p_kcal_max: number;
          p_kcal_min: number;
          p_protein_target_g: number;
          p_timezone: string;
        };
        Returns: Json;
      };
      pending_report: { Args: Record<PropertyKey, never>; Returns: Json };
      quest_xp_for: { Args: { p_difficulty: string }; Returns: number };
      reverse_quest_completion: {
        Args: { p_completion_id: string; p_user: string };
        Returns: Json;
      };
      undo_completion: { Args: { p_completion_id: string }; Returns: Json };
      update_hunter_profile: {
        Args: {
          p_hunter_name: string;
          p_kcal_max: number;
          p_kcal_min: number;
          p_protein_target_g: number;
          p_timezone: string;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const;
