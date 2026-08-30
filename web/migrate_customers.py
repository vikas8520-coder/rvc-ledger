
import os
import sys
from neon import neon

database_url = os.getenv('DATABASE_URL')
if not database_url:
    print('DATABASE_URL not set')
    sys.exit(1)

sql = neon(database_url)

# Run the migration
result = sql.run("UPDATE customers SET telugu_name = name WHERE telugu_name IS NULL")
print(f'Updated {result.row_count} customers')

# Verify
customers = sql.run("SELECT name, english_name, telugu_name, hindi_name FROM customers LIMIT 10")
for c in customers:
    print(f"name={c.name}, en={c.english_name}, te={c.telugu_name}, hi={c.hindi_name}")
