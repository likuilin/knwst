-- Adminer 4.8.1 MySQL 11.3.2-MariaDB-1:11.3.2+maria~ubu2204 dump

SET NAMES utf8;
SET time_zone = '+00:00';
SET foreign_key_checks = 0;

SET NAMES utf8mb4;

DROP DATABASE IF EXISTS `knwst`;
CREATE DATABASE `knwst` /*!40100 DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci */;
USE `knwst`;

DROP TABLE IF EXISTS `fftxs`;
CREATE TABLE `fftxs` (
  `date` date NOT NULL,
  `amount` decimal(50,4) NOT NULL,
  `market` tinyint(1) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;


DROP TABLE IF EXISTS `out_graph`;
CREATE TABLE `out_graph` (
  `date` date NOT NULL,
  `ff_no_market` decimal(50,4) DEFAULT NULL,
  `ff_market` decimal(50,4) DEFAULT NULL,
  `yf_market` decimal(50,4) DEFAULT NULL,
  `yf_invested_index` decimal(50,4) DEFAULT NULL,
  `yf_invested_spec` decimal(50,4) DEFAULT NULL,
  PRIMARY KEY (`date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;


DROP TABLE IF EXISTS `out_holdings`;
CREATE TABLE `out_holdings` (
  `brokerage` varchar(64) NOT NULL,
  `ttype` varchar(10) NOT NULL,
  `ticker` varchar(100) NOT NULL,
  `txids` text NOT NULL,
  `shorted` tinyint(1) NOT NULL,
  `open_date` date DEFAULT NULL,
  `amount` decimal(64,18) NOT NULL,
  `basis` decimal(50,4) NOT NULL,
  `value` decimal(50,4) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;


DROP TABLE IF EXISTS `out_realized`;
CREATE TABLE `out_realized` (
  `brokerage` varchar(64) NOT NULL,
  `ttype` varchar(10) NOT NULL,
  `ticker` varchar(100) NOT NULL,
  `txids` text NOT NULL,
  `acquire_date` date NOT NULL,
  `dispose_date` date NOT NULL,
  `amount` decimal(64,18) NOT NULL,
  `basis` decimal(50,4) NOT NULL,
  `proceeds` decimal(50,4) NOT NULL,
  `locate_basis_check` decimal(50,4) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;


DROP TABLE IF EXISTS `txs`;
CREATE TABLE `txs` (
  `txid` int(11) NOT NULL AUTO_INCREMENT,
  `created` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `date` date NOT NULL,
  `ttype` varchar(10) NOT NULL DEFAULT '',
  `ticker` varchar(100) NOT NULL,
  `action` varchar(20) NOT NULL,
  `amount` decimal(64,18) DEFAULT NULL,
  `price_comment` decimal(50,4) DEFAULT NULL,
  `comm_comment` decimal(50,4) DEFAULT NULL,
  `net` decimal(50,4) DEFAULT NULL,
  `brokerage` varchar(64) NOT NULL,
  `locate` text DEFAULT NULL,
  `locate_basis` decimal(50,4) DEFAULT NULL,
  `custom` varchar(100) NOT NULL DEFAULT '',
  `note_comment` text NOT NULL DEFAULT '',
  `confirm_comment` text DEFAULT NULL,
  PRIMARY KEY (`txid`),
  KEY `date` (`date`)
) ENGINE=InnoDB AUTO_INCREMENT=512 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;


DROP TABLE IF EXISTS `yfdata`;
CREATE TABLE `yfdata` (
  `ticker` varchar(100) NOT NULL,
  `downloaded` timestamp NOT NULL DEFAULT current_timestamp(),
  `date` date NOT NULL,
  `close` decimal(50,4) NOT NULL,
  UNIQUE KEY `ticker_date` (`ticker`,`date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;


-- 2024-04-13 05:54:47

