if (process.env.SUPABASE_LOCAL_TESTS !== "1") {
  console.log("supabase local tests skipped (set SUPABASE_LOCAL_TESTS=1 for local service mode)");
  process.exit(0);
}

throw new Error("Supabase local service tests require a running local Supabase project; use test:supabase:mock for offline CI coverage.");
