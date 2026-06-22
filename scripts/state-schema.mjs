export async function ensureStateSchema(query) {
  await query(`
    create table if not exists app_state (
      id text primary key,
      data jsonb not null,
      updated_at timestamptz not null default now()
    );

    create table if not exists studio_app_ui_state (
      app_state_key text primary key,
      selected_project_id text not null default '',
      selected_product_id text not null default '',
      selected_reference_id text not null default '',
      selected_character_id text not null default '',
      selected_audio_id text not null default '',
      selected_project_tab text not null default 'project',
      generation_brief jsonb not null default '{}'::jsonb,
      free_prompt text not null default '',
      extra jsonb not null default '{}'::jsonb,
      updated_at timestamptz not null default now()
    );

    create table if not exists studio_projects (
      app_state_key text not null,
      id text not null,
      sort_order integer not null default 0,
      name text not null,
      client text not null default '',
      export_folder text not null default '',
      yandex_disk_folder text not null default '',
      daily_limit integer not null default 20,
      used_today integer not null default 0,
      project_limit integer not null default 500,
      used_total integer not null default 0,
      company_info text not null default '',
      company_audience text not null default '',
      project_theme text not null default '',
      niche text not null default '',
      key_scenarios text not null default '',
      audience_pains text not null default '',
      audience_desires text not null default '',
      audience_objections text not null default '',
      allowed_triggers text not null default '',
      forbidden_triggers text not null default '',
      hook_aggression text not null default '',
      content_restrictions text not null default '',
      tone_of_voice text not null default '',
      restrictions text not null default '',
      style text not null default '',
      last_reference_update text not null default '',
      avatar_round_robin_index integer not null default 0,
      automation jsonb not null default '{}'::jsonb,
      cta_overlay jsonb not null default '{}'::jsonb,
      references jsonb not null default '[]'::jsonb,
      audio_library jsonb not null default '[]'::jsonb,
      avatar_candidates jsonb not null default '[]'::jsonb,
      design_reference_candidates jsonb not null default '[]'::jsonb,
      characters jsonb not null default '[]'::jsonb,
      extra jsonb not null default '{}'::jsonb,
      updated_at timestamptz not null default now(),
      primary key (app_state_key, id)
    );

    create table if not exists studio_products (
      app_state_key text not null,
      id text not null,
      project_id text not null,
      sort_order integer not null default 0,
      name text not null,
      description text not null default '',
      offer text not null default '',
      components text not null default '',
      pains jsonb not null default '[]'::jsonb,
      facts jsonb not null default '[]'::jsonb,
      forbidden jsonb not null default '[]'::jsonb,
      references jsonb not null default '[]'::jsonb,
      extra jsonb not null default '{}'::jsonb,
      updated_at timestamptz not null default now(),
      primary key (app_state_key, id),
      foreign key (app_state_key, project_id) references studio_projects(app_state_key, id) on delete cascade
    );

    create table if not exists studio_jobs (
      app_state_key text not null,
      id text not null,
      sort_order integer not null default 0,
      project_id text not null,
      product_id text not null,
      character_id text not null default '',
      status text not null default '',
      stage text not null default '',
      progress integer not null default 0,
      title text not null default '',
      topic text not null default '',
      music text not null default '',
      prompt text not null default '',
      reference_title text not null default '',
      output_type text not null default '',
      final_video_url text not null default '',
      final_video_has_audio boolean not null default false,
      semantic_key text not null default '',
      meaning_pattern_id text not null default '',
      product_visual_mode text not null default '',
      composition_mode text not null default '',
      content_layer_id text not null default '',
      format text not null default '',
      input_urls jsonb not null default '[]'::jsonb,
      input_refs jsonb not null default '[]'::jsonb,
      diversity_slot jsonb,
      extra jsonb not null default '{}'::jsonb,
      updated_at timestamptz not null default now(),
      primary key (app_state_key, id),
      foreign key (app_state_key, project_id) references studio_projects(app_state_key, id) on delete cascade,
      foreign key (app_state_key, product_id) references studio_products(app_state_key, id) on delete cascade
    );

    create table if not exists studio_global_audio_assets (
      app_state_key text not null,
      id text not null,
      sort_order integer not null default 0,
      title text not null default '',
      mood text not null default '',
      duration text not null default '',
      file_name text not null default '',
      file_type text not null default '',
      file_size bigint not null default 0,
      file_data text not null default '',
      created_at text not null default '',
      extra jsonb not null default '{}'::jsonb,
      updated_at timestamptz not null default now(),
      primary key (app_state_key, id)
    );

    create table if not exists studio_hook_library_state (
      app_state_key text primary key,
      active_version_id text not null default '',
      updated_at timestamptz not null default now()
    );

    create table if not exists studio_hook_versions (
      app_state_key text not null,
      id text not null,
      sort_order integer not null default 0,
      title text not null default '',
      status text not null default 'test',
      created_at text not null default '',
      source_type text not null default 'text',
      extra jsonb not null default '{}'::jsonb,
      updated_at timestamptz not null default now(),
      primary key (app_state_key, id)
    );

    create table if not exists studio_hook_items (
      app_state_key text not null,
      id text not null,
      version_id text not null,
      sort_order integer not null default 0,
      text text not null default '',
      enabled boolean not null default true,
      tags jsonb not null default '[]'::jsonb,
      aggression text not null default '',
      extra jsonb not null default '{}'::jsonb,
      updated_at timestamptz not null default now(),
      primary key (app_state_key, id),
      foreign key (app_state_key, version_id) references studio_hook_versions(app_state_key, id) on delete cascade
    );

    create table if not exists studio_reels_research (
      app_state_key text primary key,
      updated_at text not null default '',
      accounts jsonb not null default '[]'::jsonb,
      model_analysis text not null default '',
      model_writing text not null default '',
      errors jsonb not null default '[]'::jsonb,
      videos jsonb not null default '[]'::jsonb,
      summary jsonb not null default '{}'::jsonb,
      extra jsonb not null default '{}'::jsonb,
      touched_at timestamptz not null default now()
    );

    create index if not exists idx_studio_projects_app_state_sort
      on studio_projects(app_state_key, sort_order);
    create index if not exists idx_studio_products_app_state_project_sort
      on studio_products(app_state_key, project_id, sort_order);
    create index if not exists idx_studio_products_app_state_sort
      on studio_products(app_state_key, sort_order);
    create index if not exists idx_studio_jobs_app_state_project_sort
      on studio_jobs(app_state_key, project_id, sort_order);
    create index if not exists idx_studio_jobs_app_state_product
      on studio_jobs(app_state_key, product_id);
    create index if not exists idx_studio_jobs_app_state_sort
      on studio_jobs(app_state_key, sort_order);
    create index if not exists idx_studio_jobs_app_state_status
      on studio_jobs(app_state_key, status);
    create index if not exists idx_studio_global_audio_app_state_sort
      on studio_global_audio_assets(app_state_key, sort_order);
    create index if not exists idx_studio_hook_versions_app_state_sort
      on studio_hook_versions(app_state_key, sort_order);
    create index if not exists idx_studio_hook_items_app_state_version_sort
      on studio_hook_items(app_state_key, version_id, sort_order);
    create index if not exists idx_studio_hook_items_app_state_sort
      on studio_hook_items(app_state_key, sort_order);
    create unique index if not exists idx_studio_hook_versions_one_active
      on studio_hook_versions(app_state_key)
      where status = 'active';
  `);
}
