CREATE TABLE IF NOT EXISTS users (
  id         CHAR(36) NOT NULL PRIMARY KEY,
  name       VARCHAR(100) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS chats (
  id         CHAR(36) NOT NULL PRIMARY KEY,
  type       ENUM('direct', 'group') NOT NULL,
  name       VARCHAR(100) NULL,
  direct_key VARCHAR(73) NULL,
  created_by CHAR(36) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  UNIQUE KEY uq_chats_direct_key (direct_key),
  CONSTRAINT fk_chats_created_by FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT chk_chats_direct_key CHECK ((type = 'direct' AND direct_key IS NOT NULL) OR (type = 'group' AND direct_key IS NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS chat_members (
  chat_id   CHAR(36) NOT NULL,
  user_id   CHAR(36) NOT NULL,
  role      ENUM('admin', 'member') NOT NULL DEFAULT 'member',
  joined_at DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  PRIMARY KEY (chat_id, user_id),
  KEY idx_chat_members_user (user_id),
  CONSTRAINT fk_cm_chat FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE,
  CONSTRAINT fk_cm_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
