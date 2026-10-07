create table public.chat_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null default 'New chat' check (char_length(btrim(title)) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create index chat_sessions_user_updated_idx
  on public.chat_sessions (user_id, updated_at desc);

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  user_id uuid not null default auth.uid(),
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(btrim(content)) between 1 and 12000),
  created_at timestamptz not null default now(),
  foreign key (session_id, user_id)
    references public.chat_sessions (id, user_id)
    on delete cascade
);

create index chat_messages_session_created_idx
  on public.chat_messages (session_id, created_at);

alter table public.chat_sessions enable row level security;
alter table public.chat_messages enable row level security;

create policy "Users can manage their own chat sessions"
  on public.chat_sessions for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can read their own chat messages"
  on public.chat_messages for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can add messages to their own chat sessions"
  on public.chat_messages for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can delete their own chat messages"
  on public.chat_messages for delete
  to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.append_my_chat_turn(
  p_session_id uuid,
  p_user_message text,
  p_assistant_message text,
  p_title text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  existing_title text;
  existing_message_count integer;
begin
  if current_user_id is null then
    raise exception 'Sign-in is required to save a chat';
  end if;
  if char_length(btrim(coalesce(p_user_message, ''))) not between 1 and 4000 then
    raise exception 'The user message must contain 1 to 4,000 characters';
  end if;
  if char_length(btrim(coalesce(p_assistant_message, ''))) not between 1 and 12000 then
    raise exception 'The assistant message is invalid';
  end if;
  if char_length(btrim(coalesce(p_title, ''))) not between 1 and 80 then
    raise exception 'The chat title must contain 1 to 80 characters';
  end if;

  select title into existing_title
  from public.chat_sessions
  where id = p_session_id and user_id = current_user_id
  for update;

  if not found then
    raise exception 'Chat session not found';
  end if;

  select count(*) into existing_message_count
  from public.chat_messages
  where session_id = p_session_id and user_id = current_user_id;

  if existing_message_count > 198 then
    raise exception 'This chat has reached its 200-message limit. Start a new chat to continue.';
  end if;

  insert into public.chat_messages (session_id, user_id, role, content)
  values
    (p_session_id, current_user_id, 'user', p_user_message),
    (p_session_id, current_user_id, 'assistant', p_assistant_message);

  update public.chat_sessions
  set
    title = case when existing_title = 'New chat' then left(btrim(p_title), 80) else title end,
    updated_at = now()
  where id = p_session_id and user_id = current_user_id;
end;
$$;

grant select, insert, update, delete on public.chat_sessions to authenticated;
grant select, insert, delete on public.chat_messages to authenticated;
grant execute on function public.append_my_chat_turn(uuid, text, text, text) to authenticated;
