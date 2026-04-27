# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [v1.1.3 Core-CE] - 2026-04-26

### Added
- Added this `CHANGELOG.md` to track patch and release updates in a standard format.

### Changed
- Hardened model file operations to constrain reads/deletes to the `models/` tree.
- Hardened mod loading by validating entrypoint paths and preventing install-root escape.
- Restricted external URL opening to approved schemes (`https`, `http`, `mailto`).
- Tightened `.env` token file write behavior with restrictive permissions.

### Security
- Added regression coverage for mod entrypoint security validation (absolute/traversal rejection).
