# Habit Hub - Server

Simple Express + MongoDB backend for the Habit Tracker project (Assignment 10).

## Features
- CRUD for habits
- Public habits listing & search
- Mark habit complete (records completionHistory and recalculates streak)
- Basic users collection CRUD
- Optional reviews collection
- Simple dev auth via header `x-dev-email` (useful while testing without Firebase)

## Setup

1. Copy `.env.example` to `.env` and fill values (MONGO_URI, DB_NAME).
2. Install: use node/nodemon index.js
