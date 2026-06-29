-- ============================================================================
-- Одноразовая чистка: удалить насидированные ПУСТЫЕ placeholder-сценарии.
-- Новая модель: пакет = цель месяца, а карточки рождаются из референсов и
-- считаются с момента «Взято в работу». Старые пустышки больше не нужны.
-- Трогает ТОЛЬКО карточки без какого-либо содержимого и не начатые — безопасно.
-- Сначала прогони SELECT (увидишь сколько удалится), потом DELETE.
-- ============================================================================

-- Предпросмотр: сколько пустышек будет удалено (по клиентам)
-- select client_id, count(*) from public.scripts
-- where coalesce(script_status,'notStarted')='notStarted'
--   and coalesce(video_status,'notStarted')='notStarted'
--   and coalesce(hook,'')='' and coalesce(hook_text,'')='' and coalesce(body_text,'')=''
--   and coalesce(cta,'')='' and coalesce(ref_url,'')='' and coalesce(ref_text,'')=''
--   and coalesce(transcription,'')='' and coalesce(description,'')=''
-- group by client_id order by count(*) desc;

delete from public.scripts
where coalesce(script_status,'notStarted')='notStarted'
  and coalesce(video_status,'notStarted')='notStarted'
  and coalesce(hook,'')=''
  and coalesce(hook_text,'')=''
  and coalesce(body_text,'')=''
  and coalesce(cta,'')=''
  and coalesce(ref_url,'')=''
  and coalesce(ref_text,'')=''
  and coalesce(transcription,'')=''
  and coalesce(description,'')='';
