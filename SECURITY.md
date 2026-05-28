# Security Policy

## Supported Versions

The latest version on the `main` branch is actively maintained.

## Reporting a Vulnerability

If you discover a vulnerability, please report it privately to the maintainer instead of opening a public issue.

Contact:

- GitHub: https://github.com/basgenix4u
- Website: https://alimswrite.com
- LinkedIn: https://www.linkedin.com/in/abdulbasit-abdulalim-94a701354

Please include:

- A clear description of the issue
- Steps to reproduce
- Impact and affected files/routes
- Suggested fix if available

## Secret Management

Never commit real production values for:

- `.env` files
- API keys
- Database URLs
- OAuth secrets
- Admin passwords
- Private certificates or keystores

Use `.env.example` for safe placeholders only.
