#!/usr/bin/env python3
"""Restore an application JSON backup into a NEW local SQLite database for recovery drills.
Never overwrites a database. Production replacement is an operator-controlled step.
"""
import argparse, json, sqlite3
from pathlib import Path
TABLES=['auth_user','auth_account','users','categories','posts','comments','votes','bookmarks','preferences','reads','media','notifications','reports','tickets','audit_log','settings','recovery_codes']
def restore(backup_path, output_path):
    backup=json.loads(Path(backup_path).read_text(encoding='utf-8-sig'))
    if backup.get('format')!='freespeech-backup-v1' or backup.get('schema')!=3:
        raise ValueError('Unsupported backup format/schema; use the matching application release.')
    tables=backup.get('tables',{})
    if set(tables)!=set(TABLES): raise ValueError('Backup table set is incomplete or unexpected.')
    output=Path(output_path).resolve()
    with output.open('x'): pass  # Fail safely if the destination already exists.
    connection=sqlite3.connect(output)
    try:
        connection.execute('PRAGMA foreign_keys=ON')
        for migration in sorted((Path(__file__).resolve().parent.parent/'drizzle').glob('*.sql')):
            connection.executescript(migration.read_text(encoding='utf-8-sig'))
        with connection:
            for table in TABLES:
                expected={r[1] for r in connection.execute(f'PRAGMA table_info("{table}")')}
                rows=tables[table]
                if not isinstance(rows,list): raise ValueError('Invalid table rows: '+table)
                for row in rows:
                    if not isinstance(row,dict) or set(row)!=expected: raise ValueError('Invalid columns: '+table)
                    keys=list(row)
                    columns=','.join('"'+k+'"' for k in keys)
                    placeholders=','.join('?' for _ in keys)
                    connection.execute(f'INSERT INTO "{table}" ({columns}) VALUES ({placeholders})',[row[k] for k in keys])
            failures=list(connection.execute('PRAGMA foreign_key_check'))
            if failures: raise ValueError('Foreign-key validation failed.')
        if connection.execute('PRAGMA integrity_check').fetchone()[0]!='ok': raise ValueError('SQLite integrity check failed.')
        print('Restored and verified '+str(sum(len(rows) for rows in tables.values()))+' records into a new SQLite database.')
        print('Blob media bytes and the separately stored staff encryption key still need recovery.')
    finally:
        connection.close()
if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('backup'); parser.add_argument('new_database')
    args=parser.parse_args();restore(args.backup,args.new_database)
