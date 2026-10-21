CREATE TABLE public_communities (category TEXT PRIMARY KEY NOT NULL REFERENCES categories(slug), creator_id TEXT NOT NULL REFERENCES users(id), topic TEXT NOT NULL, created_at INTEGER NOT NULL);
