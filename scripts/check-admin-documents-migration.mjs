import { readFileSync } from "node:fs";

const migrationPath = "supabase/migrations/20261121012926_add_administrative_document_management.sql";
const sql = readFileSync(migrationPath, "utf8").toLowerCase();

const checks = [
  ["RLS enabled for document metadata", /alter table public\.admin_documents enable row level security/],
  ["RLS enabled for file metadata", /alter table public\.admin_document_files enable row level security/],
  ["Public and anon table access revoked", /revoke all on table public\.admin_documents, public\.admin_document_files from public, anon, authenticated/],
  ["Only authenticated users receive metadata read grants", /grant select on table public\.admin_documents to authenticated/],
  ["Administrative read permission mapped", /'admin_documents\.read'/],
  ["Administrative manage permission mapped", /'admin_documents\.manage'/],
  ["Directors limited to non-sensitive categories", /category in \('institutional','maintenance','purchases','other'\)/],
  ["Private bucket configured", /values \('admin-documents-private','admin-documents-private',false,10485760/],
  ["Bucket MIME allowlist configured", /allowed_mime_types/],
  ["Storage upload requires a pending authorized intent", /create policy admin_documents_private_upload on storage\.objects[\s\s\S]*can_upload_admin_document_file/],
  ["Storage reads require ready status and permission", /create policy admin_documents_private_read on storage\.objects[\s\s\S]*can_read_admin_document_file/],
  ["Upload intents expire", /expires_at>now\(\)/],
  ["Upload finalization binds the intended document", /where f\.id=p_file_id and f\.document_id=p_document_id/],
  ["Upload finalization verifies byte size", /v_actual_size<>v_file\.byte_size/],
  ["Upload finalization verifies MIME type", /v_actual_mime<>v_file\.mime_type/],
  ["Private authorization functions use an empty search path", /security definer set search_path=''/],
  ["Public RPC execution is revoked from anon and public", /revoke all on function public\.finalize_admin_document_file\(uuid,uuid\) from public,anon/],
];

const failed = checks.filter(([, pattern]) => !pattern.test(sql));
for (const [label] of checks) console.log(`${failed.some(([failedLabel]) => failedLabel === label) ? "FAIL" : "PASS"} ${label}`);
if (failed.length) {
  console.error(`\n${failed.length} administrative-document migration check(s) failed.`);
  process.exitCode = 1;
} else {
  console.log(`\nAll ${checks.length} administrative-document migration checks passed.`);
}
