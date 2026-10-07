revoke all on function public.create_scorelytics_profile() from public, anon, authenticated;
revoke all on function public.replace_my_test_results(jsonb) from public, anon;
revoke all on function public.import_my_legacy_data(text, jsonb, jsonb) from public, anon;
revoke all on function public.append_my_chat_turn(uuid, text, text, text) from public, anon;

grant execute on function public.replace_my_test_results(jsonb) to authenticated;
grant execute on function public.import_my_legacy_data(text, jsonb, jsonb) to authenticated;
grant execute on function public.append_my_chat_turn(uuid, text, text, text) to authenticated;
