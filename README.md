# CLASSEEQ website + private admin dashboard

```
index.html            public website (reads published products from Supabase)
config.js             your Supabase URL + anon key (the only file you edit)
js/supabase-lite.js   small dependency-free Supabase client
admin/                private dashboard  ->  https://YOUR-SITE/admin/
supabase/schema.sql   tables, Row Level Security, storage bucket + policies
```

## One-time setup (use your EXISTING Supabase project)
1. Supabase > **SQL Editor** > paste `supabase/schema.sql` > Run. (Safe to re-run; it only adds the new tables/policies.)
2. **Authentication > Sign In / Providers > Email**: turn OFF "Allow new users to sign up" (no public registration).
3. **Authentication > Users > Add user**: create your admin email + a strong password.
4. SQL Editor: `insert into public.admins (user_id) select id from auth.users where email = 'you@example.com';`
5. Project Settings > API: copy **Project URL** and the **anon public** key into `config.js`.
   Never use or paste the `service_role` key anywhere in this project.
6. Upload the whole folder to GitHub and enable Pages. Open `/admin/` and sign in.

## How it works
- Admin saves a product: images are resized (max 1600px) and uploaded to the public `product-images` bucket, the row goes to `products`.
- The public page loads `products where is_published = true` on every visit (and refreshes every 60 s), so new, edited, unpublished or deleted products update with no HTML edits. Your original 10 photos stay as the default collection.
- Security is enforced by Row Level Security: visitors can only SELECT published products; INSERT/UPDATE/DELETE (products, categories, images) require a user listed in `public.admins`. A signed-in user who is not in `admins` is rejected by both the UI and the database.
- Admin pages are `noindex`, not linked from the public site, and sessions auto-expire after 30 minutes idle.
