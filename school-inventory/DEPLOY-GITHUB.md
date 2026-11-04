# Деплой через GitHub Actions → GHCR → Dokploy

Сервер больше ничего не собирает. GitHub собирает Docker-образ, кладёт его в GitHub Container Registry (GHCR) и через API просит Dokploy перезапустить сервис с новым образом. На VPS с 2 ГБ это убирает главный риск: нехватку памяти при `next build`.

```
git push main → test → build image → ghcr.io/… :latest + :<sha> → POST /api/compose.deploy → Dokploy скачивает образ и перезапускает
```

## 1. Репозиторий

```sh
git init && git add . && git commit -m "init"
git branch -M main
git remote add origin git@github.com:<логин>/<репозиторий>.git
git push -u origin main
```

Репозиторий делайте **приватным**. Перед первым коммитом проверьте `git status`: в нём не должно быть `.env`, `.env.local`, `data/`.

## 2. Доступ сервера к GHCR (один раз)

Образы в приватном репозитории тоже приватные. GitHub → Settings → Developer settings → Personal access tokens → **Tokens (classic)** → scope только `read:packages`. Затем на сервере по SSH:

```sh
echo <токен> | docker login ghcr.io -u <логин> --password-stdin
```

(Либо Dokploy → Settings → Registry → Add: `ghcr.io`, логин, этот токен.)

## 3. Сервис в Dokploy

1. Project → Create Service → **Compose** → Provider: GitHub (или Git), репозиторий, ветка `main`.
2. Compose Path: см. таблицу ниже. **Autodeploy в Dokploy выключите**, деплой запускает GitHub Actions после сборки образа. Иначе Dokploy начнёт деплой раньше, чем образ будет готов.
3. Environment: переменные из таблицы.
4. Domains: сервис и порт из таблицы, HTTPS, Let's Encrypt.

| | Инвентаризация | car-temp-web |
|---|---|---|
| Compose Path | `./compose.dokploy.yaml` | `./docker-compose.dokploy.yml` |
| Образ(ы) | `IMAGE=ghcr.io/<логин>/<репо>:latest` | `WEB_IMAGE=ghcr.io/<логин>/<репо>-web:latest`, `COLLECTOR_IMAGE=ghcr.io/<логин>/<репо>-collector:latest` |
| Остальное | `DB_PASSWORD`, `APP_ORIGIN`, `APP_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `SCHOOL_NAME` | см. `.env.example` |
| Домен | сервис `app`, порт `3000` | сервис `web`, порт `3000` |

Имя образа пишется **строчными буквами**, даже если в логине GitHub есть заглавные.

## 4. Секреты GitHub

Repo → Settings → Secrets and variables → Actions → New repository secret:

| Секрет | Где взять |
|---|---|
| `DOKPLOY_URL` | адрес панели, например `https://dokploy.example.ru` (или `http://IP:3000`) |
| `DOKPLOY_TOKEN` | Dokploy → Profile → API/CLI → Generate token |
| `DOKPLOY_COMPOSE_ID` | ID compose-сервиса: виден в адресе страницы сервиса в Dokploy (`…/services/compose/<ID>`) или через `curl -H "x-api-key: <token>" $DOKPLOY_URL/api/project.all` |

Workflow использует environment `production`. В Settings → Environments можно включить ручное подтверждение деплоя.

Пока секреты не заданы, workflow собирает и публикует образ, а шаг деплоя пропускает с предупреждением. Это удобно для первого запуска.

## 5. Первый запуск

1. `git push` → Actions → дождитесь зелёного прогона (первая сборка 3–6 минут, дальше быстрее за счёт кэша).
2. Packages в профиле GitHub → убедитесь, что образ появился.
3. Dokploy → Deploy (первый раз вручную), дальше сам.

## Откат

Каждый образ дополнительно помечен SHA коммита. Чтобы откатиться, поменяйте в Environment `:latest` на `:<sha>` нужного коммита и нажмите Deploy.
