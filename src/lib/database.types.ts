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
          streak: number;
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
          streak?: number;
          user_id: string;
        };
        Update: {
          acknowledged_at?: string | null;
          closed_at?: string;
          core_done?: number;
          core_total?: number;
          log_date?: string;
          status?: string;
          streak?: number;
          user_id?: string;
        };
        Relationships: [];
      };
      exercises: {
        Row: {
          archived_at: string | null;
          category: string | null;
          created_at: string;
          equipment: string | null;
          force: string | null;
          id: string;
          kind: string;
          mechanic: string | null;
          name: string;
          primary_muscles: string[];
          secondary_muscles: string[];
          source_id: string | null;
          user_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          archived_at?: string | null;
          category?: string | null;
          created_at?: string;
          equipment?: string | null;
          force?: string | null;
          id?: string;
          kind: string;
          mechanic?: string | null;
          name: string;
          primary_muscles?: string[];
          secondary_muscles?: string[];
          source_id?: string | null;
          user_id?: string | null;
        };
        Update: {
          archived_at?: string | null;
          category?: string | null;
          created_at?: string;
          equipment?: string | null;
          force?: string | null;
          id?: string;
          kind?: string;
          mechanic?: string | null;
          name?: string;
          primary_muscles?: string[];
          secondary_muscles?: string[];
          source_id?: string | null;
          user_id?: string | null;
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
          penalty_mode: string;
          protein_target_g: number;
          rest_days: number[];
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          effective_on: string;
          kcal_max: number;
          kcal_min: number;
          penalty_mode: string;
          protein_target_g: number;
          rest_days: number[];
          user_id: string;
        };
        Update: {
          created_at?: string;
          effective_on?: string;
          kcal_max?: number;
          kcal_min?: number;
          penalty_mode?: string;
          protein_target_g?: number;
          rest_days?: number[];
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
          rules_from: string;
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
          rules_from: string;
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
          rules_from?: string;
          timezone?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      penalties: {
        Row: {
          acknowledged_at: string | null;
          choice: string | null;
          chosen_at: string | null;
          created_at: string;
          debt_amount: number | null;
          debt_level: number | null;
          debt_rate_percent: number | null;
          escalated: boolean;
          id: string;
          missed_quests: NonNullable<Json>;
          mode: string;
          resolved_at: string | null;
          state: string;
          trial_category: string | null;
          trial_deadline: string | null;
          trial_quest_id: string | null;
          trigger_day: string;
          updated_at: string;
          user_id: string;
          weakened_from: string | null;
          weakened_stat: string | null;
          weakened_until: string | null;
          penalty_json: Json | null;
          penalty_options: Json | null;
        };
        ComputedFields: 'penalty_json' | 'penalty_options';
        Insert: {
          acknowledged_at?: string | null;
          choice?: string | null;
          chosen_at?: string | null;
          created_at?: string;
          debt_amount?: number | null;
          debt_level?: number | null;
          debt_rate_percent?: number | null;
          escalated?: boolean;
          id?: string;
          missed_quests: NonNullable<Json>;
          mode: string;
          resolved_at?: string | null;
          state: string;
          trial_category?: string | null;
          trial_deadline?: string | null;
          trial_quest_id?: string | null;
          trigger_day: string;
          updated_at?: string;
          user_id: string;
          weakened_from?: string | null;
          weakened_stat?: string | null;
          weakened_until?: string | null;
        };
        Update: {
          acknowledged_at?: string | null;
          choice?: string | null;
          chosen_at?: string | null;
          created_at?: string;
          debt_amount?: number | null;
          debt_level?: number | null;
          debt_rate_percent?: number | null;
          escalated?: boolean;
          id?: string;
          missed_quests?: NonNullable<Json>;
          mode?: string;
          resolved_at?: string | null;
          state?: string;
          trial_category?: string | null;
          trial_deadline?: string | null;
          trial_quest_id?: string | null;
          trigger_day?: string;
          updated_at?: string;
          user_id?: string;
          weakened_from?: string | null;
          weakened_stat?: string | null;
          weakened_until?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'penalties_trial_quest_id_fkey';
            columns: ['trial_quest_id'];
            isOneToOne: false;
            referencedRelation: 'quests';
            referencedColumns: ['id'];
          },
        ];
      };
      personal_records: {
        Row: {
          baseline: boolean;
          created_at: string;
          exercise_id: string;
          id: string;
          occurred_on: string;
          pr_kind: string;
          reversed_at: string | null;
          set_id: string | null;
          user_id: string;
          value_centi: number;
          workout_id: string | null;
          xp_event_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          baseline: boolean;
          created_at?: string;
          exercise_id: string;
          id?: string;
          occurred_on: string;
          pr_kind: string;
          reversed_at?: string | null;
          set_id?: string | null;
          user_id: string;
          value_centi: number;
          workout_id?: string | null;
          xp_event_id?: string | null;
        };
        Update: {
          baseline?: boolean;
          created_at?: string;
          exercise_id?: string;
          id?: string;
          occurred_on?: string;
          pr_kind?: string;
          reversed_at?: string | null;
          set_id?: string | null;
          user_id?: string;
          value_centi?: number;
          workout_id?: string | null;
          xp_event_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'personal_records_exercise_id_fkey';
            columns: ['exercise_id'];
            isOneToOne: false;
            referencedRelation: 'exercises';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'personal_records_set_id_fkey';
            columns: ['set_id'];
            isOneToOne: false;
            referencedRelation: 'workout_sets';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'personal_records_workout_id_fkey';
            columns: ['workout_id'];
            isOneToOne: false;
            referencedRelation: 'workouts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'personal_records_xp_event_id_fkey';
            columns: ['xp_event_id'];
            isOneToOne: false;
            referencedRelation: 'xp_events';
            referencedColumns: ['id'];
          },
        ];
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
          on_rest_days: boolean;
          penalty_id: string | null;
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
          on_rest_days?: boolean;
          penalty_id?: string | null;
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
          on_rest_days?: boolean;
          penalty_id?: string | null;
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
        Relationships: [
          {
            foreignKeyName: 'quests_penalty_id_fkey';
            columns: ['penalty_id'];
            isOneToOne: false;
            referencedRelation: 'penalties';
            referencedColumns: ['id'];
          },
        ];
      };
      redemption_stone_events: {
        Row: {
          created_at: string;
          delta: number;
          id: string;
          log_date: string | null;
          occurred_on: string;
          penalty_id: string | null;
          reason: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          delta: number;
          id?: string;
          log_date?: string | null;
          occurred_on: string;
          penalty_id?: string | null;
          reason: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          delta?: number;
          id?: string;
          log_date?: string | null;
          occurred_on?: string;
          penalty_id?: string | null;
          reason?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'redemption_stone_events_penalty_fk';
            columns: ['penalty_id'];
            isOneToOne: false;
            referencedRelation: 'penalties';
            referencedColumns: ['id'];
          },
        ];
      };
      safe_periods: {
        Row: {
          created_at: string;
          end_on: string;
          ended_early_on: string | null;
          id: string;
          kind: string;
          start_on: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          end_on: string;
          ended_early_on?: string | null;
          id?: string;
          kind: string;
          start_on: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          end_on?: string;
          ended_early_on?: string | null;
          id?: string;
          kind?: string;
          start_on?: string;
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
          distance_m: number | null;
          duration_s: number | null;
          exercise_id: string | null;
          exercise_name: string;
          id: string;
          reps: number | null;
          set_index: number;
          set_type: string;
          user_id: string;
          weight_kg: number | null;
          workout_id: string;
        };
        ComputedFields: never;
        Insert: {
          distance_m?: number | null;
          duration_s?: number | null;
          exercise_id?: string | null;
          exercise_name: string;
          id?: string;
          reps?: number | null;
          set_index: number;
          set_type?: string;
          user_id: string;
          weight_kg?: number | null;
          workout_id: string;
        };
        Update: {
          distance_m?: number | null;
          duration_s?: number | null;
          exercise_id?: string | null;
          exercise_name?: string;
          id?: string;
          reps?: number | null;
          set_index?: number;
          set_type?: string;
          user_id?: string;
          weight_kg?: number | null;
          workout_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'workout_sets_exercise_id_fkey';
            columns: ['exercise_id'];
            isOneToOne: false;
            referencedRelation: 'exercises';
            referencedColumns: ['id'];
          },
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
          penalty_id: string | null;
          related_event_id: string | null;
          reverses_event_id: string | null;
          sense_xp: number;
          source_id: string | null;
          source_type: string;
          str_xp: number;
          user_id: string;
          vit_xp: number;
          weakened: boolean;
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
          penalty_id?: string | null;
          related_event_id?: string | null;
          reverses_event_id?: string | null;
          sense_xp?: number;
          source_id?: string | null;
          source_type: string;
          str_xp?: number;
          user_id: string;
          vit_xp?: number;
          weakened?: boolean;
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
          penalty_id?: string | null;
          related_event_id?: string | null;
          reverses_event_id?: string | null;
          sense_xp?: number;
          source_id?: string | null;
          source_type?: string;
          str_xp?: number;
          user_id?: string;
          vit_xp?: number;
          weakened?: boolean;
          xp?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'xp_events_penalty_id_fkey';
            columns: ['penalty_id'];
            isOneToOne: false;
            referencedRelation: 'penalties';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'xp_events_related_event_id_fkey';
            columns: ['related_event_id'];
            isOneToOne: false;
            referencedRelation: 'xp_events';
            referencedColumns: ['id'];
          },
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
      acknowledge_penalty: { Args: Record<PropertyKey, never>; Returns: Json };
      acknowledge_report: { Args: Record<PropertyKey, never>; Returns: Json };
      active_completion_id: { Args: { p_day: string; p_quest_id: string }; Returns: string };
      allocate_points: { Args: { p_points: number; p_stat: string }; Returns: Json };
      apply_award: {
        Args: {
          p_category: string;
          p_day: string;
          p_free_points?: number;
          p_full_xp: number;
          p_penalty_id?: string;
          p_source: string;
          p_source_id: string;
          p_stats: Json;
          p_user: string;
        };
        Returns: Json;
      };
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
          on_rest_days: boolean;
          penalty_id: string | null;
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
      capped_xp_on: {
        Args: { p_category: string; p_day: string; p_user: string };
        Returns: number;
      };
      catch_up_days: { Args: { p_user: string }; Returns: number };
      choose_penalty: { Args: { p_choice: string }; Returns: Json };
      clear_trial: {
        Args: {
          p_quest: Omit<
            Database['public']['Tables']['quests']['Row'],
            Database['public']['Tables']['quests']['ComputedFields']
          >;
          p_user: string;
          p_value: number;
        };
        Returns: Json;
      };
      close_days: { Args: Record<PropertyKey, never>; Returns: Json };
      close_days_for: { Args: { p_user: string }; Returns: Json };
      complete_quest: { Args: { p_quest_id: string; p_value?: number }; Returns: Json };
      compute_award: {
        Args: {
          p_cap_room: number;
          p_debt_remaining: number;
          p_full_xp: number;
          p_source: string;
          p_stats: Json;
          p_weakened_stat: string;
        };
        Returns: Record<string, unknown>;
      };
      compute_quest_award: {
        Args: {
          p_category: string;
          p_category_xp_today: number;
          p_difficulty: string;
          p_stat_tags: string[];
        };
        Returns: Record<string, unknown>;
      };
      counts_toward_core_tally: {
        Args: {
          p_is_core: boolean;
          p_on_rest_days: boolean;
          p_rest_day: boolean;
          p_scheduled: boolean;
        };
        Returns: boolean;
      };
      daily_cap_for: { Args: { p_category: string }; Returns: number };
      day_outcome: {
        Args: {
          p_core_done: number;
          p_core_total: number;
          p_phase2: boolean;
          p_rest_day: boolean;
          p_safe: boolean;
        };
        Returns: Record<string, unknown>;
      };
      debt_amount: { Args: { p_level: number; p_rate_percent: number }; Returns: number };
      debt_repayment: { Args: { p_award_xp: number; p_debt_remaining: number }; Returns: number };
      delete_food: { Args: { p_id: string }; Returns: Json };
      delete_workout: { Args: { p_id: string }; Returns: Json };
      e1rm_centi: { Args: { p_reps: number; p_weight_centi: number }; Returns: number };
      earns_stone: {
        Args: { p_held: number; p_mode: string; p_streak_after: number; p_streak_before: number };
        Returns: boolean;
      };
      effective_rules: {
        Args: { p_day: string; p_user: string };
        Returns: Record<string, unknown>;
      };
      effective_targets: {
        Args: { p_day: string; p_user: string };
        Returns: Record<string, unknown>;
      };
      end_safe_period: { Args: { p_id: string }; Returns: Json };
      evaluate_auto_kcal_range: { Args: { p_day: string; p_user: string }; Returns: Json };
      evaluate_auto_protein: { Args: { p_day: string; p_user: string }; Returns: Json };
      evaluate_auto_workout: { Args: { p_day: string; p_user: string }; Returns: Json };
      evaluate_food_trial: { Args: { p_user: string }; Returns: Json };
      expire_trials: { Args: { p_user: string }; Returns: number };
      failed_day_action: {
        Args: { p_mode: string; p_open_escalated: boolean; p_open_state: string };
        Returns: Record<string, unknown>;
      };
      game_config_int: { Args: { p_key: string }; Returns: number };
      game_config_value: { Args: { p_key: string }; Returns: Json };
      game_date_at: {
        Args: { p_instant: string; p_start_hour?: number; p_timezone: string };
        Returns: string;
      };
      game_today: { Args: Record<PropertyKey, never>; Returns: string };
      game_today_for: { Args: { p_user: string }; Returns: string };
      hunter_level: { Args: { p_user: string }; Returns: number };
      hunter_snapshot: { Args: Record<PropertyKey, never>; Returns: Json };
      is_safe_on: { Args: { p_day: string; p_user: string }; Returns: boolean };
      is_valid_timezone: { Args: { p_timezone: string }; Returns: boolean };
      level_from_total_xp: { Args: { p_total_xp: number }; Returns: number };
      log_food: { Args: { p_kcal: number; p_name: string; p_protein_g: number }; Returns: Json };
      log_workout: { Args: { p_notes: string; p_sets?: Json; p_title: string }; Returns: Json };
      next_streak: { Args: { p_effect: string; p_previous: number }; Returns: number };
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
      open_penalty: {
        Args: { p_user: string };
        Returns: {
          acknowledged_at: string | null;
          choice: string | null;
          chosen_at: string | null;
          created_at: string;
          debt_amount: number | null;
          debt_level: number | null;
          debt_rate_percent: number | null;
          escalated: boolean;
          id: string;
          missed_quests: NonNullable<Json>;
          mode: string;
          resolved_at: string | null;
          state: string;
          trial_category: string | null;
          trial_deadline: string | null;
          trial_quest_id: string | null;
          trigger_day: string;
          updated_at: string;
          user_id: string;
          weakened_from: string | null;
          weakened_stat: string | null;
          weakened_until: string | null;
        };
        SetofOptions: {
          from: '*';
          to: 'penalties';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      penalty_debt_remaining: { Args: { p_penalty_id: string }; Returns: number };
      penalty_json: {
        Args: {
          p_penalty: Omit<
            Database['public']['Tables']['penalties']['Row'],
            Database['public']['Tables']['penalties']['ComputedFields']
          >;
        };
        Returns: Json;
      };
      penalty_on_failed_day: {
        Args: { p_day: string; p_missed: Json; p_mode: string; p_user: string };
        Returns: Json;
      };
      penalty_options: {
        Args: {
          p_penalty: Omit<
            Database['public']['Tables']['penalties']['Row'],
            Database['public']['Tables']['penalties']['ComputedFields']
          >;
        };
        Returns: Json;
      };
      penalty_transition_allowed: {
        Args: { p_choice: string; p_from: string; p_to: string };
        Returns: boolean;
      };
      pending_report: { Args: Record<PropertyKey, never>; Returns: Json };
      pr_kind_allowed: { Args: { p_kind: string }; Returns: boolean };
      quest_on_board: {
        Args: {
          p_day: string;
          p_quest: Omit<
            Database['public']['Tables']['quests']['Row'],
            Database['public']['Tables']['quests']['ComputedFields']
          >;
          p_timezone: string;
        };
        Returns: boolean;
      };
      quest_overdue_on: {
        Args: { p_day: string; p_due_on: string; p_is_done: boolean; p_type: string };
        Returns: boolean;
      };
      quest_scheduled_on: {
        Args: {
          p_archived_at: string;
          p_created_at: string;
          p_day: string;
          p_due_on: string;
          p_schedule_days: number[];
          p_timezone: string;
          p_type: string;
        };
        Returns: boolean;
      };
      quest_xp_for: { Args: { p_difficulty: string }; Returns: number };
      redeem_penalty: { Args: { p_penalty_id: string }; Returns: Json };
      reverse_award: { Args: { p_event_id: string; p_user: string }; Returns: Json };
      reverse_quest_completion: {
        Args: { p_completion_id: string; p_user: string };
        Returns: Json;
      };
      safe_days_bookable: { Args: { p_start_on: string; p_user: string }; Returns: number };
      safe_effective_end: { Args: { p_end_on: string; p_ended_early_on: string }; Returns: string };
      safe_period_refusal: {
        Args: {
          p_days: number;
          p_ended_early: string[];
          p_ends: string[];
          p_start_on: string;
          p_starts: string[];
        };
        Returns: string;
      };
      safe_period_refusal_for: {
        Args: { p_days: number; p_start_on: string; p_user: string };
        Returns: string;
      };
      safe_period_start: {
        Args: { p_mode: string; p_now: string; p_timezone: string };
        Returns: string;
      };
      safe_start_for: { Args: { p_user: string }; Returns: string };
      split_by_weight: {
        Args: { p_minimum?: number; p_stats: Json; p_total: number };
        Returns: Json;
      };
      start_debt: {
        Args: { p_escalated: boolean; p_penalty_id: string; p_rate_percent: number };
        Returns: undefined;
      };
      start_safe_period: { Args: { p_days: number; p_kind: string }; Returns: Json };
      start_trial: { Args: { p_penalty_id: string }; Returns: undefined };
      stones_held: { Args: { p_user: string }; Returns: number };
      to_centi: { Args: { p_kg: number }; Returns: number };
      trial_category: { Args: { p_categories: string[] }; Returns: string };
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
      update_hunter_rules: {
        Args: { p_penalty_mode: string; p_rest_days: number[] };
        Returns: Json;
      };
      weakened_stat_for: { Args: { p_tags: string[] }; Returns: string };
      weakened_stat_on: { Args: { p_day: string; p_user: string }; Returns: string };
      weekdays_are_distinct: { Args: { p_days: number[] }; Returns: boolean };
      xp_to_next: { Args: { p_level: number }; Returns: number };
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
