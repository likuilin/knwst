-- Adminer 4.8.1 MySQL 11.3.2-MariaDB-1:11.3.2+maria~ubu2204 dump

SET NAMES utf8;
SET time_zone = '+00:00';
SET foreign_key_checks = 0;

SET NAMES utf8mb4;

DROP DATABASE IF EXISTS `knwst`;
CREATE DATABASE `knwst` /*!40100 DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci */;
USE `knwst`;

DROP TABLE IF EXISTS `brokerages`;
CREATE TABLE `brokerages` (
  `brokerage` varchar(64) NOT NULL,
  `nw_include` tinyint(1) NOT NULL,
  `taxable` tinyint(1) NOT NULL,
  `out_cash` decimal(50,4) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;


DROP TABLE IF EXISTS `fftxs`;
CREATE TABLE `fftxs` (
  `date` date NOT NULL,
  `amount` decimal(50,4) NOT NULL,
  `brokerage` tinyint(1) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;


DROP TABLE IF EXISTS `hist_notes`;
CREATE TABLE `hist_notes` (
  `date` date NOT NULL,
  `yvalue` int(11) NOT NULL,
  `note` text NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;


DROP TABLE IF EXISTS `out_graph`;
CREATE TABLE `out_graph` (
  `date` date NOT NULL,
  `ff_nonbrokerage` decimal(50,4) NOT NULL,
  `ff_brokerage` decimal(50,4) NOT NULL,
  `nw_alloc_cash` decimal(50,4) NOT NULL,
  `nw_alloc_index` decimal(50,4) NOT NULL,
  `nw_alloc_nonindex` decimal(50,4) NOT NULL,
  `nw_exposure_spec` decimal(50,4) NOT NULL,
  `nw_exposure_total` decimal(50,4) NOT NULL,
  `nw_exposure_exus` decimal(50,4) NOT NULL,
  `nw_exposure_us` decimal(50,4) NOT NULL,
  `nw_exposure_bond` decimal(50,4) NOT NULL,
  PRIMARY KEY (`date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;


DROP TABLE IF EXISTS `out_holdings`;
CREATE TABLE `out_holdings` (
  `id` int(11) NOT NULL,
  `brokerage` varchar(64) NOT NULL,
  `ticker` varchar(100) NOT NULL,
  `shorted` tinyint(1) NOT NULL,
  `open_date` date NOT NULL,
  `amount` decimal(64,18) NOT NULL,
  `basis` decimal(50,4) NOT NULL,
  `notes` text NOT NULL,
  `cur_value` decimal(50,4) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;


DROP TABLE IF EXISTS `out_realized`;
CREATE TABLE `out_realized` (
  `id` int(11) NOT NULL,
  `brokerage` varchar(64) NOT NULL,
  `ticker` varchar(100) NOT NULL,
  `acquire_date` date NOT NULL,
  `dispose_date` date NOT NULL,
  `amount` decimal(64,18) NOT NULL,
  `basis` decimal(50,4) NOT NULL,
  `notes` text NOT NULL,
  `proceeds` decimal(50,4) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;


DROP TABLE IF EXISTS `pre_fftxs`;
CREATE TABLE `pre_fftxs` (
  `date` date NOT NULL,
  `description` text NOT NULL,
  `amount` decimal(50,4) NOT NULL,
  `acct` varchar(16) NOT NULL,
  KEY `date` (`date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;


DROP TABLE IF EXISTS `tickers`;
CREATE TABLE `tickers` (
  `ticker` varchar(100) NOT NULL,
  `ticker_type` varchar(10) NOT NULL,
  `price_override` decimal(50,4) DEFAULT NULL,
  `out_price` decimal(64,18) DEFAULT NULL,
  `exposure_type` varchar(10) NOT NULL DEFAULT 'spec',
  `exposure_factor` int(11) NOT NULL DEFAULT 1,
  `allocation_index` tinyint(1) NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;


DROP TABLE IF EXISTS `txs`;
CREATE TABLE `txs` (
  `txid` int(11) NOT NULL AUTO_INCREMENT,
  `created` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `date` date NOT NULL,
  `ticker` varchar(100) NOT NULL DEFAULT '',
  `action` varchar(20) NOT NULL,
  `amount` decimal(64,18) DEFAULT NULL,
  `price_comment` decimal(50,4) DEFAULT NULL,
  `comm_comment` decimal(50,4) DEFAULT NULL,
  `net` decimal(50,4) DEFAULT NULL,
  `brokerage` varchar(64) NOT NULL,
  `locate` text NOT NULL DEFAULT '',
  `special` varchar(100) NOT NULL DEFAULT '',
  `note_comment` text NOT NULL DEFAULT '',
  `confirm_comment` text NOT NULL DEFAULT '',
  PRIMARY KEY (`txid`),
  KEY `date` (`date`)
) ENGINE=InnoDB AUTO_INCREMENT=1027 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;


DROP TABLE IF EXISTS `yfdata`;
CREATE TABLE `yfdata` (
  `ticker` varchar(100) NOT NULL,
  `downloaded` timestamp NOT NULL DEFAULT current_timestamp(),
  `date` date NOT NULL,
  `close` decimal(64,18) NOT NULL,
  `implied` tinyint(1) NOT NULL,
  UNIQUE KEY `ticker_date` (`ticker`,`date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;


-- 2024-04-27 09:44:26
