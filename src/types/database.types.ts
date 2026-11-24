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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      administrative_records: {
        Row: {
          category: string
          created_at: string
          created_by_membership_id: string
          description: string
          due_date: string | null
          id: string
          institution_id: string
          record_code: string | null
          record_date: string
          resolution_notes: string | null
          status: string
          title: string
          updated_at: string
          updated_by_membership_id: string | null
        }
        Insert: {
          category: string
          created_at?: string
          created_by_membership_id: string
          description: string
          due_date?: string | null
          id?: string
          institution_id: string
          record_code?: string | null
          record_date?: string
          resolution_notes?: string | null
          status?: string
          title: string
          updated_at?: string
          updated_by_membership_id?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          created_by_membership_id?: string
          description?: string
          due_date?: string | null
          id?: string
          institution_id?: string
          record_code?: string | null
          record_date?: string
          resolution_notes?: string | null
          status?: string
          title?: string
          updated_at?: string
          updated_by_membership_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "administrative_records_created_by_membership_id_fkey"
            columns: ["created_by_membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "administrative_records_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "administrative_records_updated_by_membership_id_fkey"
            columns: ["updated_by_membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id"]
          },
        ]
      }
      academic_years: {
        Row: {
          created_at: string
          ends_on: string
          grading_scale_id: string | null
          id: string
          institution_id: string
          name: string
          starts_on: string
          status: string
        }
        Insert: {
          created_at?: string
          ends_on: string
          grading_scale_id?: string | null
          id?: string
          institution_id: string
          name: string
          starts_on: string
          status?: string
        }
        Update: {
          created_at?: string
          ends_on?: string
          grading_scale_id?: string | null
          id?: string
          institution_id?: string
          name?: string
          starts_on?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "academic_years_grading_scale_fk"
            columns: ["grading_scale_id", "institution_id"]
            isOneToOne: false
            referencedRelation: "grading_scales"
            referencedColumns: ["id", "institution_id"]
          },
          {
            foreignKeyName: "academic_years_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
        ]
      }
      announcements: {
        Row: {
          audience: string
          body: string
          created_at: string
          created_by: string | null
          division_id: string | null
          expires_at: string | null
          id: string
          institution_id: string
          published_at: string | null
          title: string
        }
        Insert: {
          audience?: string
          body: string
          created_at?: string
          created_by?: string | null
          division_id?: string | null
          expires_at?: string | null
          id?: string
          institution_id: string
          published_at?: string | null
          title: string
        }
        Update: {
          audience?: string
          body?: string
          created_at?: string
          created_by?: string | null
          division_id?: string | null
          expires_at?: string | null
          id?: string
          institution_id?: string
          published_at?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_division_id_institution_id_fkey"
            columns: ["division_id", "institution_id"]
            isOneToOne: false
            referencedRelation: "divisions"
            referencedColumns: ["id", "institution_id"]
          },
          {
            foreignKeyName: "announcements_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
        ]
      }
      assessments: {
        Row: {
          assessment_date: string | null
          course_subject_id: string
          created_at: string
          created_by: string | null
          description: string | null
          division_id: string
          grading_period_id: string
          id: string
          institution_id: string
          max_score: number
          title: string
          weight_percent: number | null
        }
        Insert: {
          assessment_date?: string | null
          course_subject_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          division_id: string
          grading_period_id: string
          id?: string
          institution_id: string
          max_score?: number
          title: string
          weight_percent?: number | null
        }
        Update: {
          assessment_date?: string | null
          course_subject_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          division_id?: string
          grading_period_id?: string
          id?: string
          institution_id?: string
          max_score?: number
          title?: string
          weight_percent?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "assessments_course_subject_id_institution_id_fkey"
            columns: ["course_subject_id", "institution_id"]
            isOneToOne: false
            referencedRelation: "course_subjects"
            referencedColumns: ["id", "institution_id"]
          },
          {
            foreignKeyName: "assessments_division_id_institution_id_fkey"
            columns: ["division_id", "institution_id"]
            isOneToOne: false
            referencedRelation: "divisions"
            referencedColumns: ["id", "institution_id"]
          },
          {
            foreignKeyName: "assessments_grading_period_id_institution_id_fkey"
            columns: ["grading_period_id", "institution_id"]
            isOneToOne: false
            referencedRelation: "grading_periods"
            referencedColumns: ["id", "institution_id"]
          },
          {
            foreignKeyName: "assessments_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
        ]
      }
      assignments: {
        Row: {
          classroom_id: string
          created_at: string
          created_by: string | null
          due_at: string | null
          id: string
          institution_id: string
          instructions: string | null
          max_score: number | null
          published_at: string | null
          title: string
        }
        Insert: {
          classroom_id: string
          created_at?: string
          created_by?: string | null
          due_at?: string | null
          id?: string
          institution_id: string
          instructions?: string | null
          max_score?: number | null
          published_at?: string | null
          title: string
        }
        Update: {
          classroom_id?: string
          created_at?: string
          created_by?: string | null
          due_at?: string | null
          id?: string
          institution_id?: string
          instructions?: string | null
          max_score?: number | null
          published_at?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignments_classroom_id_institution_id_fkey"
            columns: ["classroom_id", "institution_id"]
            isOneToOne: false
            referencedRelation: "virtual_classrooms"
            referencedColumns: ["id", "institution_id"]
          },
          {
            foreignKeyName: "assignments_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_records: {
        Row: {
          id: string
          institution_id: string
          note: string | null
          recorded_at: string
          recorded_by: string | null
          session_id: string
          status: string
          student_id: string
        }
        Insert: {
          id?: string
          institution_id: string
          note?: string | null
          recorded_at?: string
          recorded_by?: string | null
          session_id: string
          status: string
          student_id: string
        }
        Update: {
          id?: string
          institution_id?: string
          note?: string | null
          recorded_at?: string
          recorded_by?: string | null
          session_id?: string
          status?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_records_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_session_id_institution_id_fkey"
            columns: ["session_id", "institution_id"]
            isOneToOne: false
            referencedRelation: "attendance_sessions"
            referencedColumns: ["id", "institution_id"]
          },
          {
            foreignKeyName: "attendance_records_student_id_institution_id_fkey"
            columns: ["student_id", "institution_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id", "institution_id"]
          },
        ]
      }
      attendance_sessions: {
        Row: {
          created_at: string
          created_by: string | null
          division_id: string
          held_on: string
          id: string
          institution_id: string
          period_label: string | null
          status: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          division_id: string
          held_on: string
          id?: string
          institution_id: string
          period_label?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          division_id?: string
          held_on?: string
          id?: string
          institution_id?: string
          period_label?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_sessions_division_id_institution_id_fkey"
            columns: ["division_id", "institution_id"]
            isOneToOne: false
            referencedRelation: "divisions"
            referencedColumns: ["id", "institution_id"]
          },
          {
            foreignKeyName: "attendance_sessions_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_user_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: number
          institution_id: string | null
          ip_address: unknown
          metadata: Json
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: never
          institution_id?: string | null
          ip_address?: unknown
          metadata?: Json
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: never
          institution_id?: string | null
          ip_address?: unknown
          metadata?: Json
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
        ]
      }
      campuses: {
        Row: {
          address: string | null
          code: string | null
          created_at: string
          id: string
          institution_id: string
          is_main: boolean
          name: string
          phone: string | null
        }
        Insert: {
          address?: string | null
          code?: string | null
          created_at?: string
          id?: string
          institution_id: string
          is_main?: boolean
          name: string
          phone?: string | null
        }
        Update: {
          address?: string | null
          code?: string | null
          created_at?: string
          id?: string
          institution_id?: string
          is_main?: boolean
          name?: string
          phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campuses_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
        ]
      }
      classroom_file_objects: {
        Row: {
          bucket_id: string
          byte_size: number
          classroom_id: string
          created_at: string
          expires_at: string
          id: string
          institution_id: string
          material_id: string | null
          mime_type: string
          object_path: string
          original_filename: string
          purpose: string
          status: string
          submission_id: string | null
          uploaded_at: string | null
          uploaded_by_membership_id: string
        }
        Insert: {
          bucket_id?: string
          byte_size: number
          classroom_id: string
          created_at?: string
          expires_at?: string
          id?: string
          institution_id: string
          material_id?: string | null
          mime_type: string
          object_path: string
          original_filename: string
          purpose: string
          status?: string
          submission_id?: string | null
          uploaded_at?: string | null
          uploaded_by_membership_id: string
        }
        Update: {
          bucket_id?: string
          byte_size?: number
          classroom_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          institution_id?: string
          material_id?: string | null
          mime_type?: string
          object_path?: string
          original_filename?: string
          purpose?: string
          status?: string
          submission_id?: string | null
          uploaded_at?: string | null
          uploaded_by_membership_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "classroom_file_classroom_scope_fkey"
            columns: ["classroom_id", "institution_id"]
            isOneToOne: false
            referencedRelation: "virtual_classrooms"
            referencedColumns: ["id", "institution_id"]
          },
          {
            foreignKeyName: "classroom_file_material_scope_fkey"
            columns: ["material_id", "institution_id"]
            isOneToOne: false
            referencedRelation: "classroom_materials"
            referencedColumns: ["id", "institution_id"]
          },
          {
            foreignKeyName: "classroom_file_submission_scope_fkey"
            columns: ["submission_id", "institution_id"]
            isOneToOne: false
            referencedRelation: "submissions"
            referencedColumns: ["id", "institution_id"]
          },
          {
            foreignKeyName: "classroom_file_uploader_scope_fkey"
            columns: ["uploaded_by_membership_id", "institution_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id", "institution_id"]
          },
        ]
      }
      classroom_materials: {
        Row: {
          body: string | null
          classroom_id: string
          created_at: string
          created_by: string | null
          file_path: string | null
          id: string
          institution_id: string
          published_at: string | null
          title: string
        }
        Insert: {
          body?: string | null
          classroom_id: string
          created_at?: string
          created_by?: string | null
          file_path?: string | null
          id?: string
          institution_id: string
          published_at?: string | null
          title: string
        }
        Update: {
          body?: string | null
          classroom_id?: string
          created_at?: string
          created_by?: string | null
          file_path?: string | null
          id?: string
          institution_id?: string
          published_at?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "classroom_materials_classroom_id_institution_id_fkey"
            columns: ["classroom_id", "institution_id"]
            isOneToOne: false
            referencedRelation: "virtual_classrooms"
            referencedColumns: ["id", "institution_id"]
          },
          {
            foreignKeyName: "classroom_materials_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
        ]
      }
      classroom_members: {
        Row: {
          classroom_id: string
          institution_id: string
          joined_at: string
          member_role: string
          membership_id: string
        }
        Insert: {
          classroom_id: string
          institution_id: string
          joined_at?: string
          member_role: string
          membership_id: string
        }
        Update: {
          classroom_id?: string
          institution_id?: string
          joined_at?: string
          member_role?: string
          membership_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "classroom_members_classroom_id_institution_id_fkey"
            columns: ["classroom_id", "institution_id"]
            isOneToOne: false
            referencedRelation: "virtual_classrooms"
            referencedColumns: ["id", "institution_id"]
          },
          {
            foreignKeyName: "classroom_members_membership_id_institution_id_fkey"
            columns: ["membership_id", "institution_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id", "institution_id"]
          },
        ]
      }
      conversation_members: {
        Row: {
          conversation_id: string
          institution_id: string
          joined_at: string
          membership_id: string
        }
        Insert: {
          conversation_id: string
          institution_id: string
          joined_at?: string
          membership_id: string
        }
        Update: {
          conversation_id?: string
          institution_id?: string
          joined_at?: string
          membership_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_members_conversation_id_institution_id_fkey"
            columns: ["conversation_id", "institution_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id", "institution_id"]
          },
          {
            foreignKeyName: "conversation_members_membership_id_institution_id_fkey"
            columns: ["membership_id", "institution_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id", "institution_id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          institution_id: string
          subject: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          institution_id: string
          subject?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          institution_id?: string
          subject?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
        ]
      }
      course_subjects: {
        Row: {
          course_id: string
          created_at: string
          id: string
          institution_id: string
          subject_id: string
          weekly_hours: number | null
        }
        Insert: {
          course_id: string
          created_at?: string
          id?: string
          institution_id: string
          subject_id: string
          weekly_hours?: number | null
        }
        Update: {
          course_id?: string
          created_at?: string
          id?: string
          institution_id?: string
          subject_id?: string
          weekly_hours?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "course_subjects_course_id_institution_id_fkey"
            columns: ["course_id", "institution_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id", "institution_id"]
          },
          {
            foreignKeyName: "course_subjects_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_subjects_subject_id_institution_id_fkey"
            columns: ["subject_id", "institution_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id", "institution_id"]
          },
        ]
      }
      courses: {
        Row: {
          created_at: string
          grade_number: number | null
          id: string
          institution_id: string
          level_id: string
          name: string
          shift: string | null
        }
        Insert: {
          created_at?: string
          grade_number?: number | null
          id?: string
          institution_id: string
          level_id: string
          name: string
          shift?: string | null
        }
        Update: {
          created_at?: string
          grade_number?: number | null
          id?: string
          institution_id?: string
          level_id?: string
          name?: string
          shift?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "courses_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "courses_level_id_institution_id_fkey"
            columns: ["level_id", "institution_id"]
            isOneToOne: false
            referencedRelation: "education_levels"
            referencedColumns: ["id", "institution_id"]
          },
        ]
      }
      divisions: {
        Row: {
          academic_year_id: string
          campus_id: string | null
          capacity: number | null
          course_id: string
          created_at: string
          id: string
          institution_id: string
          name: string
        }
        Insert: {
          academic_year_id: string
          campus_id?: string | null
          capacity?: number | null
          course_id: string
          created_at?: string
          id?: string
          institution_id: string
          name: string
        }
        Update: {
          academic_year_id?: string
          campus_id?: string | null
          capacity?: number | null
          course_id?: string
          created_at?: string
          id?: string
          institution_id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "divisions_academic_year_id_institution_id_fkey"
            columns: ["academic_year_id", "institution_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id", "institution_id"]
          },
          {
            foreignKeyName: "divisions_campus_id_institution_id_fkey"
            columns: ["campus_id", "institution_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id", "institution_id"]
          },
          {
            foreignKeyName: "divisions_course_id_institution_id_fkey"
            columns: ["course_id", "institution_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id", "institution_id"]
          },
          {
            foreignKeyName: "divisions_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
        ]
      }
      education_levels: {
        Row: {
          code: string | null
          created_at: string
          id: string
          institution_id: string
          name: string
          sort_order: number
        }
        Insert: {
          code?: string | null
          created_at?: string
          id?: string
          institution_id: string
          name: string
          sort_order?: number
        }
        Update: {
          code?: string | null
          created_at?: string
          id?: string
          institution_id?: string
          name?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "education_levels_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
        ]
      }
      enrollment_events: {
        Row: {
          actor_membership_id: string
          created_at: string
          effective_on: string
          enrollment_id: string
          event_type: string
          from_division_id: string | null
          id: string
          institution_id: string
          reason: string | null
          student_id: string
          to_division_id: string | null
        }
        Insert: {
          actor_membership_id: string
          created_at?: string
          effective_on: string
          enrollment_id: string
          event_type: string
          from_division_id?: string | null
          id?: string
          institution_id: string
          reason?: string | null
          student_id: string
          to_division_id?: string | null
        }
        Update: {
          actor_membership_id?: string
          created_at?: string
          effective_on?: string
          enrollment_id?: string
          event_type?: string
          from_division_id?: string | null
          id?: string
          institution_id?: string
          reason?: string | null
          student_id?: string
          to_division_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "enrollment_events_actor_fk"
            columns: ["actor_membership_id", "institution_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id", "institution_id"]
          },
          {
            foreignKeyName: "enrollment_events_enrollment_fk"
            columns: ["enrollment_id", "institution_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id", "institution_id"]
          },
          {
            foreignKeyName: "enrollment_events_from_division_fk"
            columns: ["from_division_id", "institution_id"]
            isOneToOne: false
            referencedRelation: "divisions"
            referencedColumns: ["id", "institution_id"]
          },
          {
            foreignKeyName: "enrollment_events_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollment_events_student_fk"
            columns: ["student_id", "institution_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id", "institution_id"]
          },
          {
            foreignKeyName: "enrollment_events_to_division_fk"
            columns: ["to_division_id", "institution_id"]
            isOneToOne: false
            referencedRelation: "divisions"
            referencedColumns: ["id", "institution_id"]
          },
        ]
      }
      enrollments: {
        Row: {
          created_at: string
          division_id: string
          ended_on: string | null
          enrolled_on: string
          id: string
          institution_id: string
          status: string
          student_id: string
        }
        Insert: {
          created_at?: string
          division_id: string
          ended_on?: string | null
          enrolled_on?: string
          id?: string
          institution_id: string
          status?: string
          student_id: string
        }
        Update: {
          created_at?: string
          division_id?: string
          ended_on?: string | null
          enrolled_on?: string
          id?: string
          institution_id?: string
          status?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrollments_division_id_institution_id_fkey"
            columns: ["division_id", "institution_id"]
            isOneToOne: false
            referencedRelation: "divisions"
            referencedColumns: ["id", "institution_id"]
          },
          {
            foreignKeyName: "enrollments_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_student_id_institution_id_fkey"
            columns: ["student_id", "institution_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id", "institution_id"]
          },
        ]
      }
      grade_record_events: {
        Row: {
          action: string
          actor_membership_id: string
          assessment_id: string
          change_reason: string | null
          created_at: string
          id: string
          institution_id: string
          new_comment: string | null
          new_score: number | null
          old_comment: string | null
          old_score: number | null
          student_id: string
        }
        Insert: {
          action: string
          actor_membership_id: string
          assessment_id: string
          change_reason?: string | null
          created_at?: string
          id?: string
          institution_id: string
          new_comment?: string | null
          new_score?: number | null
          old_comment?: string | null
          old_score?: number | null
          student_id: string
        }
        Update: {
          action?: string
          actor_membership_id?: string
          assessment_id?: string
          change_reason?: string | null
          created_at?: string
          id?: string
          institution_id?: string
          new_comment?: string | null
          new_score?: number | null
          old_comment?: string | null
          old_score?: number | null
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "grade_record_events_actor_fk"
            columns: ["actor_membership_id", "institution_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id", "institution_id"]
          },
          {
            foreignKeyName: "grade_record_events_assessment_fk"
            columns: ["assessment_id", "institution_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id", "institution_id"]
          },
          {
            foreignKeyName: "grade_record_events_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grade_record_events_student_fk"
            columns: ["student_id", "institution_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id", "institution_id"]
          },
        ]
      }
      grade_records: {
        Row: {
          assessment_id: string
          comment: string | null
          entered_at: string
          entered_by: string | null
          id: string
          institution_id: string
          score: number | null
          student_id: string
          updated_at: string
        }
        Insert: {
          assessment_id: string
          comment?: string | null
          entered_at?: string
          entered_by?: string | null
          id?: string
          institution_id: string
          score?: number | null
          student_id: string
          updated_at?: string
        }
        Update: {
          assessment_id?: string
          comment?: string | null
          entered_at?: string
          entered_by?: string | null
          id?: string
          institution_id?: string
          score?: number | null
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "grade_records_assessment_id_institution_id_fkey"
            columns: ["assessment_id", "institution_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id", "institution_id"]
          },
          {
            foreignKeyName: "grade_records_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grade_records_student_id_institution_id_fkey"
            columns: ["student_id", "institution_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id", "institution_id"]
          },
        ]
      }
      grading_period_events: {
        Row: {
          actor_membership_id: string
          created_at: string
          from_status: string
          grading_period_id: string
          id: string
          institution_id: string
          reason: string
          to_status: string
        }
        Insert: {
          actor_membership_id: string
          created_at?: string
          from_status: string
          grading_period_id: string
          id?: string
          institution_id: string
          reason: string
          to_status: string
        }
        Update: {
          actor_membership_id?: string
          created_at?: string
          from_status?: string
          grading_period_id?: string
          id?: string
          institution_id?: string
          reason?: string
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "grading_period_events_actor_fk"
            columns: ["actor_membership_id", "institution_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id", "institution_id"]
          },
          {
            foreignKeyName: "grading_period_events_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grading_period_events_period_fk"
            columns: ["grading_period_id", "institution_id"]
            isOneToOne: false
            referencedRelation: "grading_periods"
            referencedColumns: ["id", "institution_id"]
          },
        ]
      }
      grading_periods: {
        Row: {
          academic_year_id: string
          close_reason: string | null
          closed_at: string | null
          closed_by_membership_id: string | null
          ends_on: string
          id: string
          institution_id: string
          name: string
          sort_order: number
          starts_on: string
          status: string
        }
        Insert: {
          academic_year_id: string
          close_reason?: string | null
          closed_at?: string | null
          closed_by_membership_id?: string | null
          ends_on: string
          id?: string
          institution_id: string
          name: string
          sort_order?: number
          starts_on: string
          status?: string
        }
        Update: {
          academic_year_id?: string
          close_reason?: string | null
          closed_at?: string | null
          closed_by_membership_id?: string | null
          ends_on?: string
          id?: string
          institution_id?: string
          name?: string
          sort_order?: number
          starts_on?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "grading_periods_academic_year_id_institution_id_fkey"
            columns: ["academic_year_id", "institution_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id", "institution_id"]
          },
          {
            foreignKeyName: "grading_periods_closed_by_fk"
            columns: ["closed_by_membership_id", "institution_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id", "institution_id"]
          },
          {
            foreignKeyName: "grading_periods_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
        ]
      }
      grading_scale_levels: {
        Row: {
          created_at: string
          grade_value: number | null
          grading_scale_id: string
          id: string
          institution_id: string
          is_passing: boolean
          label: string
          maximum_percentage: number
          minimum_percentage: number
          sort_order: number
        }
        Insert: {
          created_at?: string
          grade_value?: number | null
          grading_scale_id: string
          id?: string
          institution_id: string
          is_passing?: boolean
          label: string
          maximum_percentage: number
          minimum_percentage: number
          sort_order?: number
        }
        Update: {
          created_at?: string
          grade_value?: number | null
          grading_scale_id?: string
          id?: string
          institution_id?: string
          is_passing?: boolean
          label?: string
          maximum_percentage?: number
          minimum_percentage?: number
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "grading_scale_levels_scale_fk"
            columns: ["grading_scale_id", "institution_id"]
            isOneToOne: false
            referencedRelation: "grading_scales"
            referencedColumns: ["id", "institution_id"]
          },
        ]
      }
      grading_scales: {
        Row: {
          created_at: string
          description: string | null
          display_mode: string
          id: string
          institution_id: string
          maximum_value: number
          minimum_value: number
          name: string
          passing_value: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_mode?: string
          id?: string
          institution_id: string
          maximum_value?: number
          minimum_value?: number
          name: string
          passing_value?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          display_mode?: string
          id?: string
          institution_id?: string
          maximum_value?: number
          minimum_value?: number
          name?: string
          passing_value?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "grading_scales_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
        ]
      }
      guardians: {
        Row: {
          created_at: string
          id: string
          institution_id: string
          membership_id: string
          receives_notifications: boolean
          relationship_label: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          institution_id: string
          membership_id: string
          receives_notifications?: boolean
          relationship_label?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          institution_id?: string
          membership_id?: string
          receives_notifications?: boolean
          relationship_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "guardians_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guardians_membership_id_institution_id_fkey"
            columns: ["membership_id", "institution_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id", "institution_id"]
          },
        ]
      }
      institutions: {
        Row: {
          created_at: string
          display_name: string
          id: string
          legal_name: string
          locale: string
          slug: string
          status: string
          tax_id: string | null
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name: string
          id?: string
          legal_name: string
          locale?: string
          slug: string
          status?: string
          tax_id?: string | null
          timezone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
          legal_name?: string
          locale?: string
          slug?: string
          status?: string
          tax_id?: string | null
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      membership_roles: {
        Row: {
          assigned_at: string
          institution_id: string
          membership_id: string
          role_id: string
        }
        Insert: {
          assigned_at?: string
          institution_id: string
          membership_id: string
          role_id: string
        }
        Update: {
          assigned_at?: string
          institution_id?: string
          membership_id?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "membership_roles_membership_id_institution_id_fkey"
            columns: ["membership_id", "institution_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id", "institution_id"]
          },
          {
            foreignKeyName: "membership_roles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      memberships: {
        Row: {
          created_at: string
          id: string
          institution_id: string
          joined_at: string | null
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          institution_id: string
          joined_at?: string | null
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          institution_id?: string
          joined_at?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string
          conversation_id: string
          id: string
          institution_id: string
          read_at: string | null
          sender_membership_id: string
          sent_at: string
        }
        Insert: {
          body: string
          conversation_id: string
          id?: string
          institution_id: string
          read_at?: string | null
          sender_membership_id: string
          sent_at?: string
        }
        Update: {
          body?: string
          conversation_id?: string
          id?: string
          institution_id?: string
          read_at?: string | null
          sender_membership_id?: string
          sent_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_institution_id_fkey"
            columns: ["conversation_id", "institution_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id", "institution_id"]
          },
          {
            foreignKeyName: "messages_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_membership_id_institution_id_fkey"
            columns: ["sender_membership_id", "institution_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id", "institution_id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          in_app_enabled: boolean
          institution_id: string
          membership_id: string
          notification_type: string
          updated_at: string
        }
        Insert: {
          in_app_enabled?: boolean
          institution_id: string
          membership_id: string
          notification_type: string
          updated_at?: string
        }
        Update: {
          in_app_enabled?: boolean
          institution_id?: string
          membership_id?: string
          notification_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_membership_fk"
            columns: ["membership_id", "institution_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id", "institution_id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string
          created_at: string
          id: string
          institution_id: string
          notification_type: string
          read_at: string | null
          recipient_membership_id: string
          resource_id: string
          resource_type: string
          title: string
        }
        Insert: {
          body?: string
          created_at?: string
          id?: string
          institution_id: string
          notification_type: string
          read_at?: string | null
          recipient_membership_id: string
          resource_id: string
          resource_type: string
          title: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          institution_id?: string
          notification_type?: string
          read_at?: string | null
          recipient_membership_id?: string
          resource_id?: string
          resource_type?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_recipient_membership_fk"
            columns: ["recipient_membership_id", "institution_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id", "institution_id"]
          },
        ]
      }
      permissions: {
        Row: {
          created_at: string
          description: string
          id: string
          key: string
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          key: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          key?: string
        }
        Relationships: []
      }
      prefect_novelties: {
        Row: {
          category: string
          created_at: string
          created_by: string
          description: string
          division_id: string
          event_date: string
          follow_up: string | null
          id: string
          institution_id: string
          status: string
          student_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          created_by?: string
          description: string
          division_id: string
          event_date?: string
          follow_up?: string | null
          id?: string
          institution_id: string
          status?: string
          student_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string
          description?: string
          division_id?: string
          event_date?: string
          follow_up?: string | null
          id?: string
          institution_id?: string
          status?: string
          student_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "prefect_novelties_division_id_institution_id_fkey"
            columns: ["division_id", "institution_id"]
            isOneToOne: false
            referencedRelation: "divisions"
            referencedColumns: ["id", "institution_id"]
          },
          {
            foreignKeyName: "prefect_novelties_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prefect_novelties_student_id_institution_id_fkey"
            columns: ["student_id", "institution_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id", "institution_id"]
          },
        ]
      }
      admin_documents: {
        Row: {
          category: string
          created_at: string
          created_by_membership_id: string
          description: string
          document_date: string
          id: string
          institution_id: string
          reference_code: string | null
          status: string
          title: string
          updated_at: string
          updated_by_membership_id: string
        }
        Insert: {
          category: string
          created_at?: string
          created_by_membership_id: string
          description?: string
          document_date?: string
          id?: string
          institution_id: string
          reference_code?: string | null
          status?: string
          title: string
          updated_at?: string
          updated_by_membership_id: string
        }
        Update: {
          category?: string
          created_at?: string
          created_by_membership_id?: string
          description?: string
          document_date?: string
          id?: string
          institution_id?: string
          reference_code?: string | null
          status?: string
          title?: string
          updated_at?: string
          updated_by_membership_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_documents_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_document_files: {
        Row: {
          bucket_id: string
          byte_size: number
          created_at: string
          document_id: string
          expires_at: string
          id: string
          institution_id: string
          mime_type: string
          object_path: string
          original_filename: string
          uploaded_at: string | null
          uploaded_by_membership_id: string
          upload_status: string
        }
        Insert: {
          bucket_id?: string
          byte_size: number
          created_at?: string
          document_id: string
          expires_at?: string
          id?: string
          institution_id: string
          mime_type: string
          object_path: string
          original_filename: string
          uploaded_at?: string | null
          uploaded_by_membership_id: string
          upload_status?: string
        }
        Update: {
          bucket_id?: string
          byte_size?: number
          created_at?: string
          document_id?: string
          expires_at?: string
          id?: string
          institution_id?: string
          mime_type?: string
          object_path?: string
          original_filename?: string
          uploaded_at?: string | null
          uploaded_by_membership_id?: string
          upload_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_document_files_document_fk"
            columns: ["document_id", "institution_id"]
            isOneToOne: false
            referencedRelation: "admin_documents"
            referencedColumns: ["id", "institution_id"]
          },
        ]
      }
      profiles: {
        Row: {
          address: string | null
          professional_titles: string | null
          avatar_path: string | null
          avatar_style: string
          created_at: string
          display_name: string | null
          first_name: string | null
          id: string
          last_name: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          professional_titles?: string | null
          avatar_path?: string | null
          avatar_style?: string
          created_at?: string
          display_name?: string | null
          first_name?: string | null
          id: string
          last_name?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          professional_titles?: string | null
          avatar_path?: string | null
          avatar_style?: string
          created_at?: string
          display_name?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      public_site_pages: {
        Row: {
          content: Json
          id: string
          institution_id: string
          is_published: boolean
          slug: string
          title: string
          updated_at: string
        }
        Insert: {
          content?: Json
          id?: string
          institution_id: string
          is_published?: boolean
          slug: string
          title: string
          updated_at?: string
        }
        Update: {
          content?: Json
          id?: string
          institution_id?: string
          is_published?: boolean
          slug?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "public_site_pages_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
        ]
      }
      report_card_snapshots: {
        Row: {
          created_at: string
          grading_period_id: string
          id: string
          institution_id: string
          snapshot: Json
          student_id: string
          workflow_id: string
        }
        Insert: {
          created_at?: string
          grading_period_id: string
          id?: string
          institution_id: string
          snapshot: Json
          student_id: string
          workflow_id: string
        }
        Update: {
          created_at?: string
          grading_period_id?: string
          id?: string
          institution_id?: string
          snapshot?: Json
          student_id?: string
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_card_snapshots_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_card_snapshots_period_institution_fkey"
            columns: ["grading_period_id", "institution_id"]
            isOneToOne: false
            referencedRelation: "grading_periods"
            referencedColumns: ["id", "institution_id"]
          },
          {
            foreignKeyName: "report_card_snapshots_student_institution_fkey"
            columns: ["student_id", "institution_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id", "institution_id"]
          },
          {
            foreignKeyName: "report_card_snapshots_workflow_institution_fkey"
            columns: ["workflow_id", "institution_id"]
            isOneToOne: false
            referencedRelation: "report_card_workflows"
            referencedColumns: ["id", "institution_id"]
          },
        ]
      }
      report_card_workflow_events: {
        Row: {
          actor_membership_id: string
          created_at: string
          from_status: string | null
          grading_period_id: string
          id: string
          institution_id: string
          note: string | null
          student_id: string
          to_status: string
          workflow_id: string
        }
        Insert: {
          actor_membership_id: string
          created_at?: string
          from_status?: string | null
          grading_period_id: string
          id?: string
          institution_id: string
          note?: string | null
          student_id: string
          to_status: string
          workflow_id: string
        }
        Update: {
          actor_membership_id?: string
          created_at?: string
          from_status?: string | null
          grading_period_id?: string
          id?: string
          institution_id?: string
          note?: string | null
          student_id?: string
          to_status?: string
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_card_workflow_events_actor_fk"
            columns: ["actor_membership_id", "institution_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id", "institution_id"]
          },
          {
            foreignKeyName: "report_card_workflow_events_workflow_fk"
            columns: ["workflow_id", "institution_id"]
            isOneToOne: false
            referencedRelation: "report_card_workflows"
            referencedColumns: ["id", "institution_id"]
          },
        ]
      }
      report_card_workflows: {
        Row: {
          approved_at: string | null
          approved_by_membership_id: string | null
          created_at: string
          grading_period_id: string
          id: string
          institution_id: string
          published_at: string | null
          published_by_membership_id: string | null
          publication_audience: string
          rectification_reason: string | null
          status: string
          student_id: string
          submitted_at: string | null
          submitted_by_membership_id: string | null
          supersedes_workflow_id: string | null
          updated_at: string
          version_number: number
        }
        Insert: {
          approved_at?: string | null
          approved_by_membership_id?: string | null
          created_at?: string
          grading_period_id: string
          id?: string
          institution_id: string
          published_at?: string | null
          published_by_membership_id?: string | null
          publication_audience?: string
          rectification_reason?: string | null
          status?: string
          student_id: string
          submitted_at?: string | null
          submitted_by_membership_id?: string | null
          supersedes_workflow_id?: string | null
          updated_at?: string
          version_number?: number
        }
        Update: {
          approved_at?: string | null
          approved_by_membership_id?: string | null
          created_at?: string
          grading_period_id?: string
          id?: string
          institution_id?: string
          published_at?: string | null
          published_by_membership_id?: string | null
          publication_audience?: string
          rectification_reason?: string | null
          status?: string
          student_id?: string
          submitted_at?: string | null
          submitted_by_membership_id?: string | null
          supersedes_workflow_id?: string | null
          updated_at?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "report_card_workflows_approver_fk"
            columns: ["approved_by_membership_id", "institution_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id", "institution_id"]
          },
          {
            foreignKeyName: "report_card_workflows_period_fk"
            columns: ["grading_period_id", "institution_id"]
            isOneToOne: false
            referencedRelation: "grading_periods"
            referencedColumns: ["id", "institution_id"]
          },
          {
            foreignKeyName: "report_card_workflows_publisher_fk"
            columns: ["published_by_membership_id", "institution_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id", "institution_id"]
          },
          {
            foreignKeyName: "report_card_workflows_student_fk"
            columns: ["student_id", "institution_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id", "institution_id"]
          },
          {
            foreignKeyName: "report_card_workflows_submitter_fk"
            columns: ["submitted_by_membership_id", "institution_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id", "institution_id"]
          },
          {
            foreignKeyName: "report_card_workflows_supersedes_fk"
            columns: ["supersedes_workflow_id", "institution_id"]
            isOneToOne: false
            referencedRelation: "report_card_workflows"
            referencedColumns: ["id", "institution_id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          permission_id: string
          role_id: string
        }
        Insert: {
          permission_id: string
          role_id: string
        }
        Update: {
          permission_id?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_system: boolean
          key: string
          name: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          key: string
          name: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          key?: string
          name?: string
        }
        Relationships: []
      }
      staff_assignments: {
        Row: {
          assignment_type: string
          course_subject_id: string | null
          created_at: string
          division_id: string | null
          ends_on: string | null
          id: string
          institution_id: string
          membership_id: string
          starts_on: string | null
        }
        Insert: {
          assignment_type: string
          course_subject_id?: string | null
          created_at?: string
          division_id?: string | null
          ends_on?: string | null
          id?: string
          institution_id: string
          membership_id: string
          starts_on?: string | null
        }
        Update: {
          assignment_type?: string
          course_subject_id?: string | null
          created_at?: string
          division_id?: string | null
          ends_on?: string | null
          id?: string
          institution_id?: string
          membership_id?: string
          starts_on?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_assignments_course_subject_id_institution_id_fkey"
            columns: ["course_subject_id", "institution_id"]
            isOneToOne: false
            referencedRelation: "course_subjects"
            referencedColumns: ["id", "institution_id"]
          },
          {
            foreignKeyName: "staff_assignments_division_id_institution_id_fkey"
            columns: ["division_id", "institution_id"]
            isOneToOne: false
            referencedRelation: "divisions"
            referencedColumns: ["id", "institution_id"]
          },
          {
            foreignKeyName: "staff_assignments_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_assignments_membership_id_institution_id_fkey"
            columns: ["membership_id", "institution_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id", "institution_id"]
          },
        ]
      }
      student_guardians: {
        Row: {
          can_authorize: boolean
          can_view_attendance: boolean
          can_view_grades: boolean
          can_view_report_cards: boolean
          created_at: string
          guardian_id: string
          institution_id: string
          is_primary: boolean
          student_id: string
        }
        Insert: {
          can_authorize?: boolean
          can_view_attendance?: boolean
          can_view_grades?: boolean
          can_view_report_cards?: boolean
          created_at?: string
          guardian_id: string
          institution_id: string
          is_primary?: boolean
          student_id: string
        }
        Update: {
          can_authorize?: boolean
          can_view_attendance?: boolean
          can_view_grades?: boolean
          can_view_report_cards?: boolean
          created_at?: string
          guardian_id?: string
          institution_id?: string
          is_primary?: boolean
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_guardians_guardian_id_institution_id_fkey"
            columns: ["guardian_id", "institution_id"]
            isOneToOne: false
            referencedRelation: "guardians"
            referencedColumns: ["id", "institution_id"]
          },
          {
            foreignKeyName: "student_guardians_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_guardians_student_id_institution_id_fkey"
            columns: ["student_id", "institution_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id", "institution_id"]
          },
        ]
      }
      student_memberships: {
        Row: {
          created_at: string
          id: string
          institution_id: string
          membership_id: string
          student_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          institution_id: string
          membership_id: string
          student_id: string
        }
        Update: {
          created_at?: string
          id?: string
          institution_id?: string
          membership_id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_memberships_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_memberships_membership_id_institution_id_fkey"
            columns: ["membership_id", "institution_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id", "institution_id"]
          },
          {
            foreignKeyName: "student_memberships_student_id_institution_id_fkey"
            columns: ["student_id", "institution_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id", "institution_id"]
          },
        ]
      }
      student_period_observations: {
        Row: {
          author_membership_id: string
          created_at: string
          grading_period_id: string
          id: string
          institution_id: string
          observation: string
          student_id: string
          updated_at: string
        }
        Insert: {
          author_membership_id: string
          created_at?: string
          grading_period_id: string
          id?: string
          institution_id: string
          observation: string
          student_id: string
          updated_at?: string
        }
        Update: {
          author_membership_id?: string
          created_at?: string
          grading_period_id?: string
          id?: string
          institution_id?: string
          observation?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_period_observations_author_fk"
            columns: ["author_membership_id", "institution_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id", "institution_id"]
          },
          {
            foreignKeyName: "student_period_observations_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_period_observations_period_fk"
            columns: ["grading_period_id", "institution_id"]
            isOneToOne: false
            referencedRelation: "grading_periods"
            referencedColumns: ["id", "institution_id"]
          },
          {
            foreignKeyName: "student_period_observations_student_fk"
            columns: ["student_id", "institution_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id", "institution_id"]
          },
        ]
      }
      student_previous_subjects: {
        Row: {
          course_subject_id: string | null
          created_at: string
          final_grade: number | null
          id: string
          institution_id: string
          observations: string | null
          school_year: string | null
          status: "pending" | "in_progress" | "approved" | "equivalency" | "not_approved"
          student_id: string
          subject_name: string
          updated_at: string
        }
        Insert: {
          course_subject_id?: string | null
          created_at?: string
          final_grade?: number | null
          id?: string
          institution_id: string
          observations?: string | null
          school_year?: string | null
          status?: string
          student_id: string
          subject_name: string
          updated_at?: string
        }
        Update: {
          course_subject_id?: string | null
          created_at?: string
          final_grade?: number | null
          id?: string
          institution_id?: string
          observations?: string | null
          school_year?: string | null
          status?: string
          student_id?: string
          subject_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_previous_subjects_course_subject_fk"
            columns: ["course_subject_id", "institution_id"]
            isOneToOne: false
            referencedRelation: "course_subjects"
            referencedColumns: ["id", "institution_id"]
          },
          {
            foreignKeyName: "student_previous_subjects_student_institution_fk"
            columns: ["student_id", "institution_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id", "institution_id"]
          },
        ]
      }
      students: {
        Row: {
          birth_date: string | null
          created_at: string
          email: string | null
          first_name: string
          id: string
          institution_id: string
          last_name: string
          national_id_encrypted: string | null
          status: string
          student_number: string | null
          updated_at: string
        }
        Insert: {
          birth_date?: string | null
          created_at?: string
          email?: string | null
          first_name: string
          id?: string
          institution_id: string
          last_name: string
          national_id_encrypted?: string | null
          status?: string
          student_number?: string | null
          updated_at?: string
        }
        Update: {
          birth_date?: string | null
          created_at?: string
          email?: string | null
          first_name?: string
          id?: string
          institution_id?: string
          last_name?: string
          national_id_encrypted?: string | null
          status?: string
          student_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "students_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
        ]
      }
      subjects: {
        Row: {
          code: string | null
          created_at: string
          id: string
          institution_id: string
          name: string
        }
        Insert: {
          code?: string | null
          created_at?: string
          id?: string
          institution_id: string
          name: string
        }
        Update: {
          code?: string | null
          created_at?: string
          id?: string
          institution_id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "subjects_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
        ]
      }
      submission_grade_events: {
        Row: {
          changed_at: string
          changed_by: string | null
          id: string
          institution_id: string
          new_feedback: string | null
          new_graded_by: string | null
          new_score: number | null
          previous_feedback: string | null
          previous_graded_by: string | null
          previous_score: number | null
          submission_id: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          id?: string
          institution_id: string
          new_feedback?: string | null
          new_graded_by?: string | null
          new_score?: number | null
          previous_feedback?: string | null
          previous_graded_by?: string | null
          previous_score?: number | null
          submission_id: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          id?: string
          institution_id?: string
          new_feedback?: string | null
          new_graded_by?: string | null
          new_score?: number | null
          previous_feedback?: string | null
          previous_graded_by?: string | null
          previous_score?: number | null
          submission_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "submission_grade_events_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submission_grade_events_submission_scope_fkey"
            columns: ["submission_id", "institution_id"]
            isOneToOne: false
            referencedRelation: "submissions"
            referencedColumns: ["id", "institution_id"]
          },
        ]
      }
      submission_revisions: {
        Row: {
          body: string | null
          changed_at: string
          changed_by: string | null
          file_path: string | null
          id: string
          institution_id: string
          revision_number: number
          submission_id: string
          submitted_at: string | null
        }
        Insert: {
          body?: string | null
          changed_at?: string
          changed_by?: string | null
          file_path?: string | null
          id?: string
          institution_id: string
          revision_number: number
          submission_id: string
          submitted_at?: string | null
        }
        Update: {
          body?: string | null
          changed_at?: string
          changed_by?: string | null
          file_path?: string | null
          id?: string
          institution_id?: string
          revision_number?: number
          submission_id?: string
          submitted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "submission_revisions_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submission_revisions_submission_scope_fkey"
            columns: ["submission_id", "institution_id"]
            isOneToOne: false
            referencedRelation: "submissions"
            referencedColumns: ["id", "institution_id"]
          },
        ]
      }
      submissions: {
        Row: {
          assignment_id: string
          body: string | null
          created_at: string
          feedback: string | null
          file_path: string | null
          graded_by: string | null
          id: string
          institution_id: string
          score: number | null
          student_id: string
          submitted_at: string | null
        }
        Insert: {
          assignment_id: string
          body?: string | null
          created_at?: string
          feedback?: string | null
          file_path?: string | null
          graded_by?: string | null
          id?: string
          institution_id: string
          score?: number | null
          student_id: string
          submitted_at?: string | null
        }
        Update: {
          assignment_id?: string
          body?: string | null
          created_at?: string
          feedback?: string | null
          file_path?: string | null
          graded_by?: string | null
          id?: string
          institution_id?: string
          score?: number | null
          student_id?: string
          submitted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "submissions_assignment_id_institution_id_fkey"
            columns: ["assignment_id", "institution_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id", "institution_id"]
          },
          {
            foreignKeyName: "submissions_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submissions_student_id_institution_id_fkey"
            columns: ["student_id", "institution_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id", "institution_id"]
          },
        ]
      }
      subscription_plans: {
        Row: {
          code: string
          created_at: string
          currency: string
          description: string | null
          features: Json
          id: string
          is_active: boolean
          max_staff: number | null
          max_students: number | null
          monthly_price: number
          name: string
        }
        Insert: {
          code: string
          created_at?: string
          currency?: string
          description?: string | null
          features?: Json
          id?: string
          is_active?: boolean
          max_staff?: number | null
          max_students?: number | null
          monthly_price?: number
          name: string
        }
        Update: {
          code?: string
          created_at?: string
          currency?: string
          description?: string | null
          features?: Json
          id?: string
          is_active?: boolean
          max_staff?: number | null
          max_students?: number | null
          monthly_price?: number
          name?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          created_at: string
          ends_at: string | null
          external_customer_id: string | null
          external_subscription_id: string | null
          id: string
          institution_id: string
          plan_id: string
          starts_at: string
          status: string
        }
        Insert: {
          created_at?: string
          ends_at?: string | null
          external_customer_id?: string | null
          external_subscription_id?: string | null
          id?: string
          institution_id: string
          plan_id: string
          starts_at?: string
          status?: string
        }
        Update: {
          created_at?: string
          ends_at?: string | null
          external_customer_id?: string | null
          external_subscription_id?: string | null
          id?: string
          institution_id?: string
          plan_id?: string
          starts_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      support_ticket_attachments: {
        Row: {
          byte_size: number
          created_at: string
          id: string
          institution_id: string
          message_id: string | null
          mime_type: string
          original_filename: string
          storage_bucket: string
          storage_path: string
          ticket_id: string
          uploaded_by_membership_id: string
        }
        Insert: {
          byte_size: number
          created_at?: string
          id?: string
          institution_id: string
          message_id?: string | null
          mime_type: string
          original_filename: string
          storage_bucket?: string
          storage_path: string
          ticket_id: string
          uploaded_by_membership_id: string
        }
        Update: {
          byte_size?: number
          created_at?: string
          id?: string
          institution_id?: string
          message_id?: string | null
          mime_type?: string
          original_filename?: string
          storage_bucket?: string
          storage_path?: string
          ticket_id?: string
          uploaded_by_membership_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_ticket_attachments_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_ticket_attachments_message_institution_fkey"
            columns: ["message_id", "institution_id"]
            isOneToOne: false
            referencedRelation: "support_ticket_messages"
            referencedColumns: ["id", "institution_id"]
          },
          {
            foreignKeyName: "support_ticket_attachments_ticket_institution_fkey"
            columns: ["ticket_id", "institution_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id", "institution_id"]
          },
          {
            foreignKeyName: "support_ticket_attachments_uploader_institution_fkey"
            columns: ["uploaded_by_membership_id", "institution_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id", "institution_id"]
          },
        ]
      }
      support_ticket_escalations: {
        Row: {
          created_at: string
          escalated_by_membership_id: string
          id: string
          institution_id: string
          pie_case_reference: string | null
          reason: string
          sanitized_summary: string
          status: string
          ticket_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          escalated_by_membership_id: string
          id?: string
          institution_id: string
          pie_case_reference?: string | null
          reason: string
          sanitized_summary: string
          status?: string
          ticket_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          escalated_by_membership_id?: string
          id?: string
          institution_id?: string
          pie_case_reference?: string | null
          reason?: string
          sanitized_summary?: string
          status?: string
          ticket_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_ticket_escalations_actor_institution_fkey"
            columns: ["escalated_by_membership_id", "institution_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id", "institution_id"]
          },
          {
            foreignKeyName: "support_ticket_escalations_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_ticket_escalations_ticket_institution_fkey"
            columns: ["ticket_id", "institution_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id", "institution_id"]
          },
        ]
      }
      support_ticket_events: {
        Row: {
          actor_membership_id: string | null
          created_at: string
          details: Json
          event_key: string
          id: string
          institution_id: string
          ticket_id: string
        }
        Insert: {
          actor_membership_id?: string | null
          created_at?: string
          details?: Json
          event_key: string
          id?: string
          institution_id: string
          ticket_id: string
        }
        Update: {
          actor_membership_id?: string | null
          created_at?: string
          details?: Json
          event_key?: string
          id?: string
          institution_id?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_ticket_events_actor_membership_institution_fkey"
            columns: ["actor_membership_id", "institution_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id", "institution_id"]
          },
          {
            foreignKeyName: "support_ticket_events_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_ticket_events_ticket_institution_fkey"
            columns: ["ticket_id", "institution_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id", "institution_id"]
          },
        ]
      }
      support_ticket_messages: {
        Row: {
          author_kind: string
          author_membership_id: string | null
          body: string
          created_at: string
          id: string
          institution_id: string
          is_internal: boolean
          ticket_id: string
        }
        Insert: {
          author_kind?: string
          author_membership_id?: string | null
          body: string
          created_at?: string
          id?: string
          institution_id: string
          is_internal?: boolean
          ticket_id: string
        }
        Update: {
          author_kind?: string
          author_membership_id?: string | null
          body?: string
          created_at?: string
          id?: string
          institution_id?: string
          is_internal?: boolean
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_ticket_messages_author_membership_institution_fkey"
            columns: ["author_membership_id", "institution_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id", "institution_id"]
          },
          {
            foreignKeyName: "support_ticket_messages_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_ticket_messages_ticket_institution_fkey"
            columns: ["ticket_id", "institution_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id", "institution_id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          assigned_to_membership_id: string | null
          category: string
          closed_at: string | null
          created_at: string
          created_by_membership_id: string
          description: string
          occurred_at: string | null
          steps_to_reproduce: string | null
          first_response_at: string | null
          id: string
          institution_id: string
          module_key: string | null
          priority: string
          resolved_at: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to_membership_id?: string | null
          category?: string
          closed_at?: string | null
          created_at?: string
          created_by_membership_id: string
          description: string
          occurred_at?: string | null
          steps_to_reproduce?: string | null
          first_response_at?: string | null
          id?: string
          institution_id: string
          module_key?: string | null
          priority?: string
          resolved_at?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to_membership_id?: string | null
          category?: string
          closed_at?: string | null
          created_at?: string
          created_by_membership_id?: string
          description?: string
          occurred_at?: string | null
          steps_to_reproduce?: string | null
          first_response_at?: string | null
          id?: string
          institution_id?: string
          module_key?: string | null
          priority?: string
          resolved_at?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_assigned_membership_institution_fkey"
            columns: ["assigned_to_membership_id", "institution_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id", "institution_id"]
          },
          {
            foreignKeyName: "support_tickets_created_by_membership_institution_fkey"
            columns: ["created_by_membership_id", "institution_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id", "institution_id"]
          },
          {
            foreignKeyName: "support_tickets_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
        ]
      }
      virtual_classrooms: {
        Row: {
          course_subject_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          division_id: string
          id: string
          institution_id: string
          title: string
        }
        Insert: {
          course_subject_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          division_id: string
          id?: string
          institution_id: string
          title: string
        }
        Update: {
          course_subject_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          division_id?: string
          id?: string
          institution_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "virtual_classrooms_course_subject_id_institution_id_fkey"
            columns: ["course_subject_id", "institution_id"]
            isOneToOne: false
            referencedRelation: "course_subjects"
            referencedColumns: ["id", "institution_id"]
          },
          {
            foreignKeyName: "virtual_classrooms_division_id_institution_id_fkey"
            columns: ["division_id", "institution_id"]
            isOneToOne: false
            referencedRelation: "divisions"
            referencedColumns: ["id", "institution_id"]
          },
          {
            foreignKeyName: "virtual_classrooms_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_teacher_virtual_classroom: { Args: { p_institution_id: string; p_division_id: string; p_course_subject_id: string | null; p_title: string; p_description: string | null }; Returns: string }
      update_teacher_owned_classroom: { Args: { p_classroom_id: string; p_title: string; p_description: string | null }; Returns: undefined }
      get_teacher_classroom_preferences: { Args: { p_classroom_id: string }; Returns: Json }
      update_teacher_classroom_preferences: { Args: { p_classroom_id: string; p_accent_theme: string; p_layout_density: string; p_default_section: string; p_show_header_stats: boolean }; Returns: undefined }
      list_teacher_classroom_options: { Args: { p_institution_id: string }; Returns: { division_id: string; division_label: string; course_subject_id: string | null; subject_label: string; academic_year_name: string }[] }
      approve_report_card: { Args: { p_workflow_id: string }; Returns: string }
      set_report_card_publication_audience: { Args: { p_audience: string; p_workflow_id: string }; Returns: undefined }
      publish_report_card_with_audience: { Args: { p_audience: string; p_workflow_id: string }; Returns: string }
      assign_grading_scale_to_year: {
        Args: { p_academic_year_id: string; p_grading_scale_id: string }
        Returns: string
      }
      assign_staff_to_structure: {
        Args: {
          p_assignment_type: string
          p_course_subject_id?: string
          p_division_id?: string
          p_ends_on?: string
          p_institution_id: string
          p_membership_id: string
          p_starts_on?: string
        }
        Returns: string
      }
      assign_subject_to_course: {
        Args: {
          p_course_id: string
          p_institution_id: string
          p_subject_id: string
          p_weekly_hours?: number
        }
        Returns: string
      }
      close_grading_period: {
        Args: { p_grading_period_id: string; p_reason: string }
        Returns: string
      }
      close_student_enrollment: {
        Args: {
          p_effective_on: string
          p_enrollment_id: string
          p_final_status: string
          p_institution_id: string
          p_reason?: string
        }
        Returns: string
      }
      create_admin_document: {
        Args: {
          p_category: string
          p_description: string
          p_document_date: string
          p_institution_id: string
          p_reference_code: string | null
          p_title: string
        }
        Returns: string
      }
      create_admin_document_file_intent: {
        Args: {
          p_byte_size: number
          p_document_id: string
          p_mime_type: string
          p_original_filename: string
        }
        Returns: {
          bucket_id: string
          file_id: string
          object_path: string
        }[]
      }
      finalize_admin_document_file: {
        Args: { p_document_id: string; p_file_id: string }
        Returns: string
      }
      create_announcement: {
        Args: {
          p_audience: string
          p_body: string
          p_division_id?: string
          p_expires_at?: string
          p_institution_id: string
          p_title: string
        }
        Returns: string
      }
      create_campus: {
        Args: {
          p_address?: string
          p_code?: string
          p_institution_id: string
          p_is_main?: boolean
          p_name: string
          p_phone?: string
        }
        Returns: string
      }
      create_classroom_assignment: {
        Args: {
          p_classroom_id: string
          p_due_at: string | null
          p_instructions: string | null
          p_max_score: number | null
          p_publish?: boolean
          p_title: string
        }
        Returns: string
      }
      create_classroom_file_upload_intent: {
        Args: {
          p_byte_size: number
          p_material_id: string | null
          p_mime_type: string
          p_original_filename: string
          p_submission_id: string | null
        }
        Returns: {
          file_id: string
          object_path: string
        }[]
      }
      add_classroom_assignment_link: {
        Args: { p_assignment_id: string; p_title: string; p_url: string }
        Returns: string
      }
      create_classroom_assignment_resource_upload: {
        Args: {
          p_assignment_id: string
          p_byte_size: number
          p_mime_type: string
          p_original_filename: string
        }
        Returns: { resource_id: string; object_path: string }[]
      }
      finalize_classroom_assignment_resource_upload: {
        Args: { p_resource_id: string }
        Returns: string
      }
      list_classroom_assignment_resources: {
        Args: { p_classroom_id: string }
        Returns: {
          resource_id: string
          assignment_id: string
          kind: string
          title: string
          url: string | null
          object_path: string | null
          original_filename: string | null
          mime_type: string | null
          byte_size: number | null
          created_at: string
        }[]
      }
      create_classroom_material: {
        Args: {
          p_body: string | null
          p_classroom_id: string
          p_publish?: boolean
          p_title: string
        }
        Returns: string
      }
      update_classroom_material: {
        Args: {
          p_body: string | null
          p_classroom_id: string
          p_material_id: string
          p_publish: boolean
          p_title: string
        }
        Returns: string
      }
      update_classroom_assignment: {
        Args: {
          p_assignment_id: string
          p_classroom_id: string
          p_due_at: string | null
          p_instructions: string | null
          p_max_score: number | null
          p_publish: boolean
          p_title: string
        }
        Returns: string
      }
      create_virtual_classroom: {
        Args: {
          p_course_subject_id: string | null
          p_description: string | null
          p_division_id: string
          p_institution_id: string
          p_owner_membership_id: string
          p_title: string
        }
        Returns: string
      }
      update_virtual_classroom: {
        Args: {
          p_classroom_id: string
          p_description: string | null
          p_institution_id: string
          p_owner_membership_id: string
          p_title: string
        }
        Returns: undefined
      }
      list_institution_classrooms: {
        Args: { p_institution_id: string }
        Returns: {
          academic_year_name: string
          classroom_id: string
          course_name: string
          course_subject_id: string | null
          created_at: string
          description: string | null
          division_id: string
          division_name: string
          teacher_membership_id: string | null
          teacher_name: string | null
          subject_name: string | null
          title: string
        }[]
      }
      create_course: {
        Args: {
          p_grade_number?: number
          p_institution_id: string
          p_level_id: string
          p_name: string
          p_shift?: string
        }
        Returns: string
      }
      create_direct_conversation: {
        Args: {
          p_institution_id: string
          p_recipient_membership_id: string
          p_subject?: string
        }
        Returns: string
      }
      create_division: {
        Args: {
          p_academic_year_id: string
          p_campus_id: string | null
          p_capacity: number | null
          p_course_id: string
          p_institution_id: string
          p_name: string
        }
        Returns: string
      }
      create_education_level: {
        Args: {
          p_code?: string
          p_institution_id: string
          p_name: string
          p_sort_order?: number
        }
        Returns: string
      }
      create_grading_scale: {
        Args: {
          p_description: string | null
          p_display_mode: string
          p_institution_id: string
          p_levels: Json
          p_maximum_value: number
          p_minimum_value: number
          p_name: string
          p_passing_value: number | null
        }
        Returns: string
      }
      create_support_ticket_attachment_intent: {
        Args: {
          p_byte_size: number
          p_mime_type: string
          p_original_filename: string
          p_ticket_id: string
        }
        Returns: {
          attachment_id: string
          storage_bucket: string
          storage_path: string
        }[]
      }
      finalize_support_ticket_attachment: {
        Args: { p_attachment_id: string }
        Returns: string
      }
      list_support_ticket_attachments: {
        Args: { p_ticket_id: string }
        Returns: {
          byte_size: number
          created_at: string
          id: string
          mime_type: string
          original_filename: string
          storage_bucket: string
          storage_path: string
          uploaded_at: string | null
        }[]
      }
      create_student_enrollment: {
        Args: {
          p_division_id: string
          p_enrolled_on?: string
          p_institution_id: string
          p_reason?: string
          p_student_id: string
        }
        Returns: string
      }
      create_subject: {
        Args: { p_code?: string; p_institution_id: string; p_name: string }
        Returns: string
      }
      end_staff_assignment: {
        Args: {
          p_assignment_id: string
          p_ends_on: string
          p_institution_id: string
        }
        Returns: string
      }
      finalize_classroom_file_upload: {
        Args: { p_file_id: string }
        Returns: string
      }
      get_classroom_invite: {
        Args: { p_classroom_id: string }
        Returns: { enabled: boolean; expires_at: string | null; join_code: string; join_token: string }[]
      }
      rotate_classroom_invite: {
        Args: { p_classroom_id: string }
        Returns: { enabled: boolean; expires_at: string | null; join_code: string; join_token: string }[]
      }
      join_classroom_by_invite: {
        Args: { p_code?: string | null; p_token?: string | null }
        Returns: string
      }
      get_classroom_overview: {
        Args: { p_classroom_id: string }
        Returns: Json
      }
      grade_classroom_submission: {
        Args: { p_feedback?: string | null; p_score: number | null; p_submission_id: string }
        Returns: string
      }
      list_accessible_classrooms: {
        Args: { p_institution_id: string }
        Returns: {
          course_name: string
          course_subject_id: string
          created_at: string
          description: string
          division_id: string
          division_name: string
          id: string
          subject_name: string
          title: string
        }[]
      }
      list_announcement_divisions: {
        Args: { p_institution_id: string }
        Returns: {
          course_name: string
          id: string
          name: string
        }[]
      }
      list_assignable_staff_members: {
        Args: { p_institution_id: string }
        Returns: {
          display_name: string
          membership_id: string
          role_keys: string[]
        }[]
      }
      list_classroom_attendance_month: {
        Args: { p_classroom_id: string; p_month: string }
        Returns: Json
      }
      list_classroom_term_periods: {
        Args: { p_classroom_id: string }
        Returns: Json
      }
      list_classroom_term_gradebook: {
        Args: { p_classroom_id: string; p_grading_period_id: string }
        Returns: Json
      }
      save_classroom_term_gradebook: {
        Args: { p_classroom_id: string; p_grading_period_id: string; p_rows: Json }
        Returns: number
      }
      get_classroom_attendance_sheet: {
        Args: { p_classroom_id: string; p_held_on: string }
        Returns: Json
      }
      save_classroom_attendance_sheet: {
        Args: { p_classroom_id: string; p_session_id: string; p_records: Json }
        Returns: Json
      }
      list_classroom_people: {
        Args: { p_classroom_id: string }
        Returns: Json
      }
      list_classroom_files: {
        Args: { p_classroom_id: string }
        Returns: {
          byte_size: number
          created_at: string
          file_id: string
          material_id: string
          mime_type: string
          object_path: string
          original_filename: string
          purpose: string
          submission_id: string
        }[]
      }
      list_classroom_teacher_candidates: {
        Args: { p_classroom_id: string }
        Returns: {
          teacher_membership_id: string
          teacher_name: string
          is_auxiliary: boolean
          can_edit_materials: boolean
          can_edit_assignments: boolean
          can_grade: boolean
          can_attendance: boolean
        }[]
      }
      set_classroom_teacher_permissions: {
        Args: {
          p_classroom_id: string
          p_teacher_membership_id: string
          p_can_edit_materials?: boolean
          p_can_edit_assignments?: boolean
          p_can_grade?: boolean
          p_can_attendance?: boolean
          p_is_active?: boolean
        }
        Returns: string
      }
      list_guardian_teacher_appointments: {
        Args: Record<PropertyKey, never>
        Returns: {
          appointment_id: string
          student_id: string
          student_name: string
          teacher_name: string
          scheduled_at: string
          reason: string
          status: string
          created_at: string
          updated_at: string
        }[]
      }
      list_teacher_guardian_appointments: {
        Args: Record<PropertyKey, never>
        Returns: {
          appointment_id: string
          student_id: string
          student_name: string
          guardian_name: string
          scheduled_at: string
          reason: string
          status: string
          created_at: string
          updated_at: string
        }[]
      }
      respond_teacher_guardian_appointment: {
        Args: { p_appointment_id: string; p_response: string }
        Returns: boolean
      }
      update_teacher_guardian_appointment: {
        Args: { p_appointment_id: string; p_status: string }
        Returns: boolean
      }
      list_teacher_guardian_contacts: {
        Args: { p_division_id: string }
        Returns: {
          student_id: string
          student_name: string
          guardian_membership_id: string
          guardian_name: string
        }[]
      }
      create_teacher_guardian_appointment: {
        Args: {
          p_student_id: string
          p_guardian_membership_id: string
          p_scheduled_at: string
          p_reason: string
        }
        Returns: string
      }
      get_classroom_submission_history: {
        Args: { p_submission_id: string }
        Returns: Json
      }
      get_classroom_capabilities: {
        Args: { p_classroom_id: string }
        Returns: Json
      }
      list_classroom_assignment_roster: {
        Args: { p_classroom_id: string }
        Returns: {
          assignment_id: string
          student_id: string
          student_first_name: string
          student_last_name: string
          student_number: string | null
          submission_id: string | null
          submitted: boolean
          submitted_at: string | null
          body: string | null
          review_status: string | null
          score: number | null
          feedback: string | null
        }[]
      }
      set_classroom_submission_review_status: {
        Args: { p_review_status: string | null; p_submission_id: string }
        Returns: string
      }
      list_classroom_submissions: {
        Args: { p_classroom_id: string }
        Returns: {
          assignment_id: string
          body: string
          can_grade: boolean
          feedback: string
          graded_by: string
          score: number
          student_first_name: string
          student_id: string
          student_last_name: string
          student_number: string
          submission_id: string
          submitted_at: string
        }[]
      }
      list_conversation_messages: {
        Args: {
          p_conversation_id: string
          p_institution_id: string
          p_limit?: number
        }
        Returns: {
          body: string
          id: string
          is_mine: boolean
          read_at: string
          sender_membership_id: string
          sender_name: string
          sent_at: string
        }[]
      }
      list_messageable_contacts: {
        Args: { p_institution_id: string }
        Returns: {
          display_name: string
          membership_id: string
          role_keys: string[]
        }[]
      }
      list_my_conversations: {
        Args: { p_institution_id: string }
        Returns: {
          conversation_id: string
          counterpart_membership_id: string
          counterpart_name: string
          counterpart_role_keys: string[]
          last_message_at: string
          last_message_body: string
          subject: string
          unread_count: number
        }[]
      }
      list_my_portal_students: {
        Args: { p_institution_id: string }
        Returns: {
          academic_year_id: string
          academic_year_name: string
          attendance_absent: number
          attendance_early_departure: number
          attendance_justified: number
          attendance_late: number
          attendance_present: number
          attendance_total: number
          can_view_attendance: boolean
          can_view_grades: boolean
          course_name: string
          division_id: string
          division_name: string
          enrollment_status: string
          first_name: string
          is_self: boolean
          last_attendance_on: string
          last_name: string
          latest_report_card_at: string
          published_report_card_count: number
          student_id: string
          student_number: string
        }[]
      }
      list_my_child_assignment_progress: {
        Args: { p_institution_id: string; p_student_id: string }
        Returns: {
          assignment_id: string
          classroom_id: string
          subject_name: string
          classroom_title: string
          assignment_title: string
          due_at: string | null
          published_at: string | null
          submitted: boolean
          submitted_at: string | null
          review_status: string | null
          score: number | null
          max_score: number | null
          can_view_grade: boolean
        }[]
      }
      list_my_student_attendance: {
        Args: {
          p_institution_id: string
          p_limit?: number
          p_student_id: string
        }
        Returns: {
          attendance_status: string
          division_name: string
          held_on: string
          period_label: string
          session_id: string
        }[]
      }
      list_student_enrollment_events: {
        Args: { p_institution_id: string; p_student_id: string }
        Returns: {
          actor_name: string
          created_at: string
          effective_on: string
          event_type: string
          from_division_name: string
          id: string
          reason: string
          to_division_name: string
        }[]
      }
      list_students_for_grades: {
        Args: { p_institution_id: string }
        Returns: {
          first_name: string
          id: string
          last_name: string
          student_number: string
        }[]
      }
      mark_conversation_read: {
        Args: { p_conversation_id: string; p_institution_id: string }
        Returns: number
      }
      mark_notification_read: {
        Args: { p_institution_id: string; p_notification_id: string }
        Returns: boolean
      }
      publish_report_card: { Args: { p_workflow_id: string }; Returns: string }
      reopen_grading_period: {
        Args: { p_grading_period_id: string; p_reason: string }
        Returns: string
      }
      save_grade_records_batch: {
        Args: {
          p_assessment_id: string
          p_change_reason?: string | null
          p_rows: Json
        }
        Returns: number
      }
      send_conversation_message: {
        Args: {
          p_body: string
          p_conversation_id: string
          p_institution_id: string
        }
        Returns: string
      }
      set_notification_preference: {
        Args: {
          p_in_app_enabled: boolean
          p_institution_id: string
          p_notification_type: string
        }
        Returns: boolean
      }
      submit_classroom_assignment: {
        Args: { p_assignment_id: string; p_body: string }
        Returns: string
      }
      submit_report_card: {
        Args: {
          p_grading_period_id: string
          p_rectification_reason?: string | null
          p_student_id: string
        }
        Returns: string
      }
      transfer_student_enrollment: {
        Args: {
          p_effective_on: string
          p_institution_id: string
          p_new_division_id: string
          p_reason?: string
          p_student_id: string
        }
        Returns: string
      }
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
