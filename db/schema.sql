-- ============================================================
-- Bengal Heritage Atlas — Database Schema
-- Database: bengal_heritage_atlas
-- Engine:   MySQL 8.0+
-- ============================================================

-- Create database
CREATE DATABASE IF NOT EXISTS bengal_heritage_atlas
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE bengal_heritage_atlas;

-- ============================================================
-- 1. categories
-- ============================================================
CREATE TABLE IF NOT EXISTS categories (
  category_id   INT AUTO_INCREMENT PRIMARY KEY,
  category_name VARCHAR(100) NOT NULL UNIQUE,
  description   TEXT,
  icon          VARCHAR(50)  COMMENT 'CSS icon class, e.g. fa-landmark',
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 2. destinations
-- ============================================================
CREATE TABLE IF NOT EXISTS destinations (
  destination_id      INT AUTO_INCREMENT PRIMARY KEY,
  slug                VARCHAR(200)  NOT NULL UNIQUE,
  name                VARCHAR(200)  NOT NULL,
  district            VARCHAR(100)  NOT NULL,
  region              VARCHAR(100)  COMMENT 'e.g. North Bengal, South Bengal, Central Bengal',
  category_id         INT,
  short_description   TEXT          NOT NULL,
  historical_background TEXT,
  heritage_significance TEXT,
  historical_period   VARCHAR(200)  COMMENT 'e.g. 18th century, Mughal Era',
  established_year    VARCHAR(50)   COMMENT 'Approximate, e.g. circa 1690',
  unesco_status        ENUM('World Heritage Site', 'Tentative List', 'None') DEFAULT 'None',
  latitude            DECIMAL(10, 8),
  longitude           DECIMAL(11, 8),
  opening_hours       VARCHAR(500),
  entry_fee           VARCHAR(500),
  accessibility_info  TEXT,
  best_time_to_visit  VARCHAR(200),
  nearest_city        VARCHAR(200),
  featured_image_url  VARCHAR(500),
  image_credit        VARCHAR(300),
  source_url          VARCHAR(500),
  is_featured         BOOLEAN DEFAULT FALSE,
  rating              DECIMAL(2,1) DEFAULT 0.0,
  created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  CONSTRAINT fk_destinations_category
    FOREIGN KEY (category_id) REFERENCES categories(category_id)
    ON DELETE SET NULL ON UPDATE CASCADE,

  INDEX idx_destinations_district   (district),
  INDEX idx_destinations_region     (region),
  INDEX idx_destinations_category   (category_id),
  INDEX idx_destinations_featured   (is_featured),
  INDEX idx_destinations_slug       (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 3. destination_images
-- ============================================================
CREATE TABLE IF NOT EXISTS destination_images (
  image_id        INT AUTO_INCREMENT PRIMARY KEY,
  destination_id  INT          NOT NULL,
  image_url       VARCHAR(500) NOT NULL,
  alt_text        VARCHAR(300),
  image_credit    VARCHAR(300),
  sort_order      INT DEFAULT 0,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_images_destination
    FOREIGN KEY (destination_id) REFERENCES destinations(destination_id)
    ON DELETE CASCADE ON UPDATE CASCADE,

  INDEX idx_images_destination (destination_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 4. timeline_events
-- ============================================================
CREATE TABLE IF NOT EXISTS timeline_events (
  event_id              INT AUTO_INCREMENT PRIMARY KEY,
  year_label            VARCHAR(50)  NOT NULL COMMENT 'e.g. 1690, 3rd Century BCE',
  title                 VARCHAR(200) NOT NULL,
  description           TEXT,
  period                VARCHAR(100) COMMENT 'e.g. Colonial Era, Medieval Period',
  related_destination_id INT,
  sort_order            INT DEFAULT 0,

  CONSTRAINT fk_timeline_destination
    FOREIGN KEY (related_destination_id) REFERENCES destinations(destination_id)
    ON DELETE SET NULL ON UPDATE CASCADE,

  INDEX idx_timeline_sort (sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 5. admin_users
-- ============================================================
CREATE TABLE IF NOT EXISTS admin_users (
  admin_id       INT AUTO_INCREMENT PRIMARY KEY,
  username       VARCHAR(100) NOT NULL UNIQUE,
  password_hash  VARCHAR(255) NOT NULL COMMENT 'bcrypt hash',
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
