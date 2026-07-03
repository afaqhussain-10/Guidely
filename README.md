# Guidely Backend API

FastAPI-based backend service for Guidely - an interactive product demonstration and guide creation platform.

## 🏗️ Architecture

```
guidely-backend/
├── app/
│   ├── core/           # Core configurations and database
│   ├── models/         # SQLAlchemy database models
│   ├── routes/         # FastAPI route handlers
│   ├── schemas/        # Pydantic validation schemas
│   ├── services/       # Business logic services
│   └── main.py         # Application entry point
├── migrations/         # Alembic database migrations
├── static/             # Static file storage (local fallback)
│   ├── screenshots/    # Step screenshots
│   └── videos/         # Demo videos
├── .env               # Environment variables (not in git)
├── .env.example       # Environment template
├── alembic.ini        # Database migration config
└── requirements.txt   # Python dependencies
```

---

## 🚀 Features

- **Demo Management**: Create, update, delete product demos
- **Step Tracking**: Capture user interactions with coordinates
- **AI Descriptions**: Groq-powered multilingual step descriptions (EN/AR)
- **Media Storage**: 
  - Primary: AWS S3 with presigned URLs
  - Fallback: Local file storage
- **Database**: PostgreSQL with Alembic migrations
- **API Documentation**: Auto-generated Swagger/OpenAPI docs

---

## 📋 Prerequisites

- Python 3.9+
- PostgreSQL 12+
- AWS Account (optional, for S3 storage)
- Groq API Key (for AI descriptions)

---

## 🔧 Installation

### 1. Clone Repository
```bash
git clone <repository-url>
cd guidely-backend
```

### 2. Create Virtual Environment
```bash
python -m venv venv

# Windows
venv\Scripts\activate

# Linux/Mac
source venv/bin/activate
```

### 3. Install Dependencies
```bash
pip install -r requirements.txt
```

### 4. Setup PostgreSQL Database
```bash
# Create database
createdb guidely_db

# Or using psql
psql -U postgres
CREATE DATABASE guidely_db;
```

---

## ⚙️ Configuration

### 1. Environment Variables

Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```env
# Application
APP_NAME=Guidely
DEBUG=True

# Database
DATABASE_URL=postgresql://username:password@localhost:5432/guidely_db

# Groq AI (Required)
GROQ_API_KEY=gsk_your_groq_api_key_here

# AWS S3 (Optional - falls back to local storage)
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_BUCKET_NAME=guidely-demo-bucket
AWS_REGION=us-east-1
```

### 2. Get API Keys

**Groq API Key:**
1. Visit: https://console.groq.com/
2. Sign up / Login
3. Go to API Keys section
4. Create new API key
5. Copy to `.env` as `GROQ_API_KEY`

**AWS Credentials (Optional):**
1. AWS Console → IAM → Users
2. Create user with S3 permissions
3. Generate Access Key
4. Copy credentials to `.env`

---

## 🗄️ Database Setup

### Run Migrations
```bash
# Run all pending migrations
alembic upgrade head

# Create new migration (after model changes)
alembic revision --autogenerate -m "Description"
```

### Database Schema

**Demos Table:**
- `id` (UUID) - Primary key
- `title` (String) - Demo name
- `status` (String) - processing/completed/failed
- `video_url` (String) - Video location (S3/local)
- `duration` (Integer) - Video length in seconds
- `language` (String) - Demo language (en/ar)
- Branding fields: `accent_color`, `theme`, `author_name`, `cta_*`
- `created_at` (DateTime)

**Steps Table:**
- `id` (UUID) - Primary key
- `demo_id` (UUID) - Foreign key to demos
- `step_number` (Integer) - Sequential order
- `action` (String) - click/scroll/type/etc
- `element` (String) - Target element
- `coord_x`, `coord_y` (Float) - Action coordinates
- `viewport_width`, `viewport_height` (Float) - Screen dimensions
- `image_url` (String) - Screenshot location (S3/local)
- `video_url` (String) - Step video clip location
- `ai_description_en` (Text) - AI-generated English description
- `ai_description_ar` (Text) - AI-generated Arabic description
- `hotspot_text` (Text) - Short tooltip text
- `created_at` (DateTime)

---

## 🏃 Running the Server

### Development Mode
```bash
# With auto-reload
uvicorn app.main:app --reload

# Custom host/port
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### Production Mode
```bash
# Without reload
uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4
```

Server will start at: **http://localhost:8000**

---

## 📚 API Documentation

Once server is running:

- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc
- **OpenAPI JSON**: http://localhost:8000/openapi.json

---

## 🛣️ API Endpoints

### Demos

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/demos` | List all demos (with pagination) |
| POST | `/api/demos` | Create new demo |
| GET | `/api/demos/{id}` | Get single demo |
| PATCH | `/api/demos/{id}` | Update demo metadata |
| PATCH | `/api/demos/{id}/video` | Upload demo video |
| DELETE | `/api/demos/{id}` | Delete demo |
| GET | `/api/demos/{id}/sync-status` | Check media sync status |

### Steps

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/demos/{id}/steps` | List all steps for demo |
| POST | `/api/demos/{id}/steps` | Create step (with media upload) |
| POST | `/api/demos/{id}/steps/metadata` | Create step metadata only |
| PATCH | `/api/demos/{id}/steps/{step_id}` | Update step |
| PATCH | `/api/demos/{id}/steps/{step_id}/screenshot` | Upload screenshot |
| PATCH | `/api/demos/{id}/steps/{step_id}/video` | Upload step video |
| POST | `/api/demos/{id}/steps/{step_id}/confirm` | Confirm media upload |
| DELETE | `/api/demos/{id}/steps/{step_id}` | Delete step |

### Utility

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Root endpoint (health check) |
| GET | `/health` | Health check |
| GET | `/static/videos/{demo_id}/video.mp4` | Stream video with range support |

---

## 🧪 Testing

### Manual Testing
```bash
# Health check
curl http://localhost:8000/health

# Create demo
curl -X POST http://localhost:8000/api/demos \
  -H "Content-Type: application/json" \
  -d '{"title": "My Demo", "language": "en"}'

# List demos
curl http://localhost:8000/api/demos
```

### Run Tests (if available)
```bash
pytest tests/
```

---

## 🔐 Security Notes

### Production Checklist:
- [ ] Change `DEBUG=False` in production
- [ ] Use strong database passwords
- [ ] Rotate API keys regularly
- [ ] Enable HTTPS/TLS
- [ ] Configure CORS properly (restrict origins)
- [ ] Use environment-specific `.env` files
- [ ] Enable database backups
- [ ] Monitor API usage
- [ ] Implement rate limiting
- [ ] Add authentication/authorization

### CORS Configuration
Currently set to allow all origins (`allow_origins=["*"]`).

For production, update in `app/main.py`:
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://yourdomain.com"],  # Restrict origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

---

## 📦 S3 Storage Setup

### Bucket Configuration

1. **Create S3 Bucket**
   - Name: `guidely-demo-bucket` (or your choice)
   - Region: `us-east-1` (or your choice)

2. **Set Bucket Policy** (for public read)
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::guidely-demo-bucket/*"
    }
  ]
}
```

3. **CORS Configuration**
```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "PUT", "POST", "DELETE"],
    "AllowedOrigins": ["*"],
    "ExposeHeaders": ["ETag"]
  }
]
```

### S3 Storage Structure
```
guidely-demo-bucket/
├── screenshots/
│   └── {demo_id}/
│       ├── step_1.jpg
│       ├── step_2.jpg
│       └── ...
└── videos/
    └── {demo_id}/
        ├── step_1.webm
        ├── step_2.webm
        └── ...
```

---

## 🔄 Local Storage Fallback

If S3 is not configured, files store locally:

```
static/
├── screenshots/
│   └── {demo_id}/
│       └── step_{number}.png
└── videos/
    └── {demo_id}/
        └── step_{number}.mp4
```

Access via: `http://localhost:8000/static/screenshots/{demo_id}/step_1.png`

---

## 🤖 AI Description Generation

Powered by **Groq** (llama-3.3-70b-versatile model).

### How it works:
1. Extension captures step (action + element)
2. Backend calls Groq API with prompt
3. Groq returns JSON: `{description_en, description_ar}`
4. Backend saves both descriptions to database

### Example Prompt:
```
Action: click
Element: button

Response:
{
  "description_en": "Click on the button to submit",
  "description_ar": "انقر على الزر للإرسال"
}
```

---

## 📊 Database Migrations

### Create Migration
```bash
# After modifying models
alembic revision --autogenerate -m "Add new field"
```

### Apply Migration
```bash
alembic upgrade head
```

### Rollback
```bash
# Rollback one version
alembic downgrade -1

# Rollback to specific version
alembic downgrade <revision_id>
```

### View History
```bash
alembic history
```

---

## 🐛 Troubleshooting

### Database Connection Error
```
sqlalchemy.exc.OperationalError: could not connect to server
```
**Solution:** Check PostgreSQL is running and credentials in `.env` are correct.

### Groq API Error
```
Exception: Failed to generate descriptions
```
**Solution:** Verify `GROQ_API_KEY` in `.env` is valid.

### S3 Upload Failed
```
botocore.exceptions.NoCredentialsError
```
**Solution:** Check AWS credentials in `.env` or let it fallback to local storage.

### Port Already in Use
```
OSError: [Errno 98] Address already in use
```
**Solution:** Kill process on port 8000 or use different port:
```bash
# Windows
netstat -ano | findstr :8000
taskkill /PID <pid> /F

# Linux/Mac
lsof -ti:8000 | xargs kill -9
```

---

## 🔧 Development Tips

### Hot Reload
```bash
uvicorn app.main:app --reload
```
Server automatically restarts on code changes.

### Debug Mode
Set `DEBUG=True` in `.env` for detailed error messages.

### Database Reset
```bash
# Drop all tables
alembic downgrade base

# Recreate tables
alembic upgrade head
```

### View Logs
Application logs print to console (stdout).

---

## 📝 Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `APP_NAME` | No | Guidely | Application name |
| `DEBUG` | No | False | Enable debug mode |
| `DATABASE_URL` | **Yes** | - | PostgreSQL connection string |
| `GROQ_API_KEY` | **Yes** | - | Groq AI API key |
| `AWS_ACCESS_KEY_ID` | No | - | AWS access key (S3) |
| `AWS_SECRET_ACCESS_KEY` | No | - | AWS secret key (S3) |
| `AWS_BUCKET_NAME` | No | - | S3 bucket name |
| `AWS_REGION` | No | us-east-1 | AWS region |

---

## 🤝 Contributing

### Code Style
- Follow PEP 8 conventions
- Use type hints
- Add docstrings to functions/classes
- Keep functions small and focused

### Commit Messages
```
feat: Add new feature
fix: Bug fix
docs: Documentation update
refactor: Code refactoring
test: Add tests
```

---

## 📄 License

[Add your license here]

---

## 👥 Team

[Add team members here]

---

## 🔗 Related Projects

- **Guidely Frontend**: Next.js dashboard for managing demos
- **Guidely Extension**: Chrome extension for capturing user interactions

---

## 📞 Support

For issues and questions:
- GitHub Issues: [repository-url]/issues
- Email: support@guidely.com
- Documentation: [docs-url]

---

**Built with ❤️ using FastAPI, PostgreSQL, and AWS**
