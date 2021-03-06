#![feature(proc_macro_hygiene, decl_macro)]

#[cfg(test)]
#[macro_use]
extern crate lazy_static;

pub mod endpoints;
pub mod errors;
pub mod game;
pub mod game_state;
pub mod load_map;
pub mod manager;
pub mod periodic;
pub mod serializer;
pub mod types;
pub mod utils;
